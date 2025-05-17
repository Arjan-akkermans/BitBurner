/** @param {NS} ns */
// TODO: Look for eyes
// Check if points/nodes are encircled/alive, no point to place inside alive areas
// indentify shapes?
const script = 'scripts/IPvGO.ts'
const fileData = 'data/IPvGO.json';
let data = {} as IPvGOData;
let boardState = [] as IPvGOBoardState;
let chains = [] as (number | null)[][];
let liberties = [] as number[][];
let chainsByChain: Map<number, Point[]>;
let fileGlobals = 'data/globals.json';
let globals = {} as Globals;
export type IPvGOData = {
  opponent: GoOpponent,
  // stores the moves made by the player in the current 
  moves: Move[]
  movesOpponent: (Point | null)[]
}
export type IPvGONodeState = "X" | "O" | "." | "#"; // black, white, empty, dead
export type Point = { x: number, y: number }
export type Color = "X" | "O";
export type Move = { point: Point, type: MoveType }
export type MoveType = "CAPTURE" | "DEFEND" | "FREESPACE" | "SMOTHERING" | "ENCIRCLE" | "EXPENSION" | "RANDOM";
type Comparator = '<=' | '>=' | '===';
const BLACK = "X";
const WHITE = "O";
const EMPTY = ".";
const DEAD = "#"
const size = 13;
// used for debugging
const test = true;
// count number of turns, starts at 1 and increases after this script makes a move
let turn = 1;
export type IPvGOBoardState = IPvGONodeState[][];
// used to find node for which an adjacent has the specified properties
/* 
 * @param liberties, comparison states libertyOfNode - operator - amount
 */
export type AdjacentInput = { point: Point, color: "X" | "O", liberty?: { amount: number, operator: Comparator } };


export async function main(ns: NS) {
  globals = JSON.parse(ns.read(fileGlobals))
  data = ns.read(fileData) === '' ? {} : JSON.parse(ns.read(fileData));
  initialize(ns);
  ns.go.resetBoardState(data.opponent, size);
  let gameActive = true;
  while (gameActive) {
    updateBoardState(ns);
    const validMoves = ns.go.analysis.getValidMoves();
    let moveToPlay: Move | undefined = getCaptureMove(ns, validMoves);
    if (moveToPlay === undefined) {
      moveToPlay = getDefendingMove(ns, validMoves);
    }
    if (moveToPlay === undefined) {
      moveToPlay = getMaxFreeSpacesMove(ns, validMoves);
    }
    if (moveToPlay === undefined) {
      moveToPlay === getSmotheringMove(ns, validMoves);
    }
    if (moveToPlay === undefined) {
      moveToPlay = getExpensionMove(ns, validMoves);
    }
    if (moveToPlay === undefined) {
      moveToPlay = getRandomMove(ns, validMoves);
    }
    // TODO: more move options
    let result = {} as {
      type: "gameOver" | "move" | "pass";
      x: number | null;
      y: number | null;
    }
    let opponentMove = null as Point | null;
    result = {} as {
      type: "gameOver" | "move" | "pass";
      x: number | null;
      y: number | null;
    };
    if (moveToPlay === undefined) {
      // Pass turn if no moves are found
      result = await ns.go.passTurn();
      opponentMove = (result.x != null && result.y != null) ? { x: result.x, y: result.y } : null
    } else {
      // Play the selected move
      result = await ns.go.makeMove(moveToPlay.point.x, moveToPlay.point.y);
      opponentMove = (result.x != null && result.y != null) ? { x: result.x, y: result.y } : null
    }
    turn++;
    data.moves.push(moveToPlay ?? { point: { x: -1, y: -1 }, type: "RANDOM" });
    data.movesOpponent.push(opponentMove)
    gameActive = result.type !== "gameOver";

    updateHUD(ns);
  }
  ns.write(fileData, JSON.stringify(data), 'w');
  ns.spawn(script, { spawnDelay: 0 });
}

// captures enemy node by placing next to a node with liberty 1
export function getCaptureMove(ns: NS, validMoves: boolean[][]): Move | undefined {
  const moveOptions = [] as Move[];
  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y }
      // Make sure the point is a valid move
      const isValidMove = validMoves[x][y] === true;

      let adjacency: AdjacentInput = { point, color: WHITE, liberty: { amount: 1, operator: '===' } }
      if (isValidMove) {
        if (hasAdjacentWithLiberties(ns, adjacency, liberties)) {
          moveOptions.push({ point, type: "CAPTURE" },);
        }
      }
    }
  }
  // Choose one of the found moves at random
  const randomIndex = Math.floor(Math.random() * moveOptions.length);
  return moveOptions[randomIndex]

}

// defends an threathed network which currently has 1 liberty
export function getDefendingMove(ns: NS, validMoves: boolean[][]): Move | undefined {
  const moveOptions = [] as Move[];
  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y };
      // Make sure the point is a valid move
      const isValidMove = validMoves[x][y] === true;
      // Leave some spaces to make it harder to capture our pieces.
      // We don't want to run out of empty node connections!
      const isNotReservedSpace = x % 2 === 1 || y % 2 === 1;
      let adjacency: AdjacentInput = { point, color: BLACK, liberty: { amount: 1, operator: '===' } }
      if (isValidMove && isNotReservedSpace) {
        // there is an adjacent black node with 1 liberty (vulnerable)
        if (hasAdjacentWithLiberties(ns, adjacency, liberties)) {
          if ((adjacentEmpty(ns, point) === 2) || isEmptyPointBetweenTwoChains(ns, point, BLACK)) {
            moveOptions.push({ point, type: "DEFEND" })
          }

        }
      }
    }
  }
  // Choose one of the found moves at random
  const randomIndex = Math.floor(Math.random() * moveOptions.length);
  return moveOptions[randomIndex]
}

// get moves which are encircling empty space,
// i.e. adjacent to two empty points, and adjacent to either two friendsly chains, or friendly chain and edge of board
export function getEncirclingMove(ns: NS, validMoves: boolean[][]): Move | undefined {

  const moveOptions = [] as Move[];

  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y };
      // Make sure the point is a valid move
      const isValidMove = validMoves[x][y];
      let adjacency: AdjacentInput = { point, color: BLACK }
      if (isValidMove) {
        let adjacentPoints = getAdjacentPoints(ns, point);
        // next to two empty points
        if (adjacentPoints.reduce((prev, point) => prev + +(boardState[point.x][point.y] === EMPTY), 0) === 2) {
          // is adjacent to two black different chains
          if (isEmptyPointBetweenTwoChains(ns, point, BLACK)
            //OR adjacent to empty and edge 
            || (adjacentPoints.some((point) => boardState[point.x][point.y] === BLACK)
              && adjacentPoints.some((point) => isOnEdge(ns, point)))) {
            moveOptions.push({ point, type: "ENCIRCLE" });
          }
        }
      }
    }
  }

  // Choose one of the found moves at random
  const randomIndex = Math.floor(Math.random() * moveOptions.length);
  return moveOptions[randomIndex];

}
// return all moves which are adjacent to 4 empty spaces
export function getMaxFreeSpacesMove(ns: NS, validMoves: boolean[][]): Move | undefined {
  const moveOptions = [] as Move[];
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y }
      // Make sure the point is a valid move
      const isValidMove = validMoves[x][y];
      if (isValidMove && adjacentEmpty(ns, { x, y }) === 4) {
        moveOptions.push({ point, type: "FREESPACE" })
      }
    }
  }
  // Choose one of the found moves at random
  const randomIndex = Math.floor(Math.random() * moveOptions.length);
  return moveOptions[randomIndex];
}
// gets a move that expands the current network
// prefer moves that increase liberties for current lowest liberties in chain
export function getExpensionMove(ns: NS, validMoves: boolean[][]): Move | undefined {

  const moveOptions = [] as Move[];
  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y }
      // Make sure the point is a valid move
      const isValidMove = validMoves[x][y];
      // Leave some spaces to make it harder to capture our pieces.
      // We don't want to run out of empty node connections!
      const isReservedSpace = x % 2 === 0 && y % 2 === 0;

      // a reserved space should be allowed to be filled it if it will connect two different chains
      let adjacency: AdjacentInput = { point, color: BLACK, liberty: { amount: 2, operator: '>=' } }
      if (isValidMove) {
        if (hasAdjacentWithLiberties(ns, adjacency, liberties)) {
          if (!isReservedSpace || isEmptyPointBetweenTwoChains(ns, adjacency.point, adjacency.color)) {
            moveOptions.push({ point, type: "EXPENSION" });
          }
        }
      }
    }
  }

  let bestMove = undefined;
  // sort acsending number of liberties
  moveOptions.sort((a, b) => liberties[a.point.x][a.point.y] - liberties[b.point.x][b.point.y])

  let currentBestScore = -10000;
  for (let i = 0; i < moveOptions.length; i++) {
    let move = moveOptions[i];
    let score = expensionMoveScore(ns, move);
    if (score > currentBestScore) {
      currentBestScore = score;
      bestMove = move;
    }
  }
  // Choose one of the found moves at random
  const randomIndex = Math.floor(Math.random() * moveOptions.length);
  return bestMove ?? moveOptions[randomIndex];

}
// returns a score for an expensionMove
// as usually many expensionMoves are available, try to rank them instead of picking a random one
export function expensionMoveScore(ns: NS, move: Move) {
  let score = 0;
  if (move.type !== 'EXPENSION') {
    return 0;
  }
  else {
    let pointToCheck = move.point;
    let adjacentPoints = getAdjacentPoints(ns, pointToCheck);
    let numberAdjacentEmpty = adjacentPoints.reduce((prev, point) => prev + +(boardState[point.x][point.y] === EMPTY), 0);
    let numberLibertiesAdjacentthroughChains = getAdjacentLibertiesForEmpty(ns, pointToCheck, BLACK);
    let adjacentChainsOfSameColor = getAdjacentChains(ns, adjacentPoints, BLACK);
    let pointsToConnect = adjacentChainsOfSameColor.reduce((prev, c) => prev + (chainsByChain.get(c)?.length ?? 0), 0);
    // the minimum liberties of an adjacent friendly point, points with low liberty should have a higher priority to safe
    let minAdjacentLiberty = Math.min(...adjacentPoints.map((p) => boardState[p.x][p.y] === BLACK ? liberties[p.x][p.y] : 100000));
    if (numberAdjacentEmpty + numberLibertiesAdjacentthroughChains > 1) {
      // give a score, based on number in chain, current liberties liberties gained
      score = (numberAdjacentEmpty + numberLibertiesAdjacentthroughChains) * 15 // more liberties is higher score
        + (pointsToConnect) // more score for bigger chain (= can lose more)
        - 100 / Math.sqrt(minAdjacentLiberty) // 1 -> 100, 2 -> 70, 3-> 57 ... 20 -> 22.3, i.e. start high and fast, deccelerating decrease

    }
  }
  return score;
}

// find moves which can touch an opponents chain with at most 2 liberties which will not be immidiately be captures
export function getSmotheringMove(ns: NS, validMoves: boolean[][]): Move | undefined {
  const moveOptions = [] as Move[];

  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y }
      // Make sure the point is a valid move
      const isValidMove = validMoves[x][y];
      // Leave some spaces to make it harder to capture our pieces.
      // We don't want to run out of empty node connections!
      const isReservedSpace = x % 2 === 0 && y % 2 === 0;
      // a reserved space should be allowed to be filled it if it will connect two different chains
      let adjacency: AdjacentInput = { point, color: WHITE, liberty: { amount: 2, operator: '>=' } }
      if (isValidMove) {
        if (hasAdjacentWithLiberties(ns, adjacency, liberties)) {
          if (!isReservedSpace || liberties[x][y] > 2 || isEmptyPointBetweenTwoChains(ns, adjacency.point, BLACK)) {
            moveOptions.push({ point, type: "SMOTHERING" });
          }
        }
      }
    }
  }
  // Choose one of the found moves at random
  const randomIndex = Math.floor(Math.random() * moveOptions.length);
  return moveOptions[randomIndex];

}


const getRandomMove = (ns: NS, validMoves: boolean[][]): Move | undefined => {
  const moveOptions = [] as Move[];
  const board = ns.go.getBoardState() as IPvGONodeState[];
  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y };
      // Make sure the point is a valid move
      const isValidMove = validMoves[x][y] === true;
      // Leave some spaces to make it harder to capture our pieces.
      // We don't want to run out of empty node connections!
      const isNotReservedSpace = x % 2 === 1 || y % 2 === 1;

      if (isValidMove && isNotReservedSpace) {
        moveOptions.push({ point, type: "RANDOM" });
      }
    }
  }

  // Choose one of the found moves at random
  const randomIndex = Math.floor(Math.random() * moveOptions.length);
  return moveOptions[randomIndex];
};

// returns all points adjacent (up down left or right) to the input point
// dead nodes are also returned, this only filters out nodes outside of the boards
export function getAdjacentPoints(ns: NS, point: Point) {
  let points = [] as Point[];
  if (point.x > 0) { points.push({ x: point.x - 1, y: point.y }) }
  if (point.y > 0) { points.push({ x: point.x, y: point.y - 1 }) }
  if (point.x < size - 1) { points.push({ x: point.x + 1, y: point.y }) }
  if (point.y < size - 1) { points.push({ x: point.x, y: point.y + 1 }) }

  return points;
}
// Returns the number of adjacent empty spaces to a node
export function adjacentEmpty(ns: NS, point: Point) {
  let adjacentPoints = getAdjacentPoints(ns, point);
  let numberAdjacencies = adjacentPoints.reduce((prev, p) => prev + +(boardState[p.x][p.y] === EMPTY), 0);
  return numberAdjacencies;
}

// returns TRUE if the two input points belong to the same chain
export function areInSameChain(ns: NS, pointA: Point, pointB: Point) {
  let areInSameChain = chains[pointA.x][pointA.y] === chains[pointB.x][pointB.y];
  return areInSameChain;
}

export function isOnEdge(ns: NS, point: Point) {
  let x = point.x;
  let y = point.y;
  return x === 0 || y === 0 || x === size - 1 || y === size - 1;
}

export function getAdjacentChains(ns: NS, points: Point[], color: Color) {
  let chainsLocal = new Set<number>();
  for (const point of points) {
    if (boardState[point.x][point.y] !== color) {
      continue;
    }
    let chain = chains[point.x][point.y];
    if (chain !== null) {
      chainsLocal.add(chain);
    }
  }

  return [...chainsLocal];
}
// returns TRUE if the node contains an adjacent node with input properties (color and adjacent liberties)
export function hasAdjacentWithLiberties(ns: NS, adjacency: AdjacentInput, liberties: number[][]) {

  // function to check the libery (returns TRUE if liberty is not provided)
  const comparators: Record<Comparator, (a: number, b: number) => boolean> = {
    '<=': (a, b) => a <= b,
    '>=': (a, b) => a >= b,
    '===': (a, b) => a === b,
  };

  function checkLiberty() {
    if (adjacency.liberty === undefined) {
      return true;
    }
    else return comparators[adjacency.liberty?.operator](liberties[adjacency.point.x][adjacency.point.y], adjacency.liberty?.amount)
  }



  let color = adjacency.color;
  let liberty = adjacency.liberty;
  if (liberty !== undefined && (liberties.length === 0 || liberties[0].length === 0)) {
    Error(`A liberty value of ${liberty} was provided, but the input liberties matrix is ${liberties}. Either set liberty to undefined, or provide an liberties input argument`)
  }
  let adjacentPoints = getAdjacentPoints(ns, adjacency.point);
  return adjacentPoints.some((point) => boardState[point.x][point.y] === color
    && (checkLiberty()));

}

// returns TRUE if the input point is an empty point, and it connects two different chains of the input color
export function isEmptyPointBetweenTwoChains(ns: NS, point: Point, color: Color) {

  let isEmpty = boardState[point.x][point.y] === EMPTY;
  if (!isEmpty) { return }
  let foundDifferentChainsOfColor = false;
  let adjacentPoints = getAdjacentPoints(ns, point);
  adjacentPoints = adjacentPoints.filter((point) => { boardState[point.x][point.y] === color });
  for (let i = 0; i < adjacentPoints.length; i++) {
    for (let j = i + 1; j < adjacentPoints.length; j++) {
      if (!areInSameChain(ns, adjacentPoints[i], adjacentPoints[j])) {
        foundDifferentChainsOfColor = true;
        break;
      }
    }
  }
  return foundDifferentChainsOfColor;
}
// returns the amount of liberties adjacent (through chains) of the input point
export function getAdjacentLibertiesForEmpty(ns: NS, point: Point, color: Color) {
  let adjacentPoints = getAdjacentPoints(ns, point);
  let chainsLocal = new Set<number>();
  for (const adjacentPoint of adjacentPoints) {
    let chain = chains[adjacentPoint.x][adjacentPoint.y];
    if (chain === null) {
      continue;
    }
    chainsLocal.add(chain);
  }

  // all points in chain have the same liberty!
  let liberties = [...chainsLocal].reduce((prev, c) => prev + (chainsByChain.get(c)?.length ?? 0), 0);
  return liberties;

}
export function initialize(ns: NS) {
  resetData(ns);
  // assign factionToPlay
  switch (data.opponent) {
    case ns.enums.FactionName.Daedalus:
      data.opponent = ns.enums.FactionName.TheBlackHand;
      break
    case ns.enums.FactionName.TheBlackHand:
      data.opponent = ns.enums.FactionName.Illuminati;
      break;
    default:
      data.opponent = ns.enums.FactionName.Daedalus;
  }

  if (ns.singularity.getOwnedAugmentations().includes('The Red Pill')) {
    data.opponent = '????????????';
  }

  if (test) {
    data.opponent = 'No AI';
  }


}
export function resetData(ns: NS) {
  // reset data for new game
  data.moves = [];
  data.movesOpponent = [];
}

export function updateBoardState(ns: NS) {
  // create board state such that we can index similar to go notation, i.e. 0.0 is bottemLeft left
  const board = ns.go.getBoardState();
  boardState = [];
  liberties = ns.go.analysis.getLiberties();
  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    let column = [] as IPvGONodeState[]
    for (let y = 0; y < size; y++) {
      column.push(board[x][y] as IPvGONodeState);
    }
    boardState.push(column);
  }
  chains = ns.go.analysis.getChains();
  chainsByChain = new Map<number, Point[]>();
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y }
      let chainOfPoint = chains[x][y];
      if (chainOfPoint === null) {
        continue;
      }
      if (chainsByChain.has(chainOfPoint)) {
        chainsByChain.get(chainOfPoint)!.push(point);
      } else {
        chainsByChain.set(chainOfPoint, [point]);
      }

    }
  }
}


export function getLiberties(ns: NS, boardStateInput?: IPvGOBoardState) {
  let board = boardStateInput ?? boardState

}

// for easier UI display, convert point to GO coordinated
export function pointToCoordinates(ns: NS, point: Point) {
  // converts 0,0 -> A1 , 12,12 -> N,13
  // there is no I!
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];
  let letter = letters[point.x];
  let number = point.y + 1;
  return `${letter},${number}`
}
export function xToLetter(ns: NS, x: number) {

}


export function updateHUD(ns: NS) {
  globals = JSON.parse(ns.read(fileGlobals))
  if (!!globals.HUDPort) {
    let dataToWrite = { sequence: 4, rows: [] as HUDRow[] }
    let lastPlayerMove: Move = data.moves[data.moves.length - 1] ?? { point: { x: -1, y: -1 }, type: "RANDOM" };
    let LastOpponentMove: Point = data.movesOpponent[data.movesOpponent.length - 1] ?? { x: -1, y: -1 };
    dataToWrite.rows.push({ header: 'Opponent', value: `${data.opponent}` });
    dataToWrite.rows.push({ header: 'LastPlayerMove', value: `${pointToCoordinates(ns, lastPlayerMove.point)} ${lastPlayerMove.type}` });
    dataToWrite.rows.push({ header: 'LastOpponent', value: `${pointToCoordinates(ns, LastOpponentMove)}` });

    ns.writePort(globals.HUDPort, dataToWrite)
  }
}
