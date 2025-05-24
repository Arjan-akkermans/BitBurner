/** @param {NS} ns */
// TODO: Look for eyes
// Check if points/nodes are encircled/alive, no point to place inside alive areas
// indentify shapes?
// used for debugging and playing vs AI
const test = false;
// for testing, currently best test opponent
const hardcodedFactionToPlay = undefined //'Tetrads';


const script = 'scripts/IPvGO.ts'
const fileData = 'data/IPvGO.json';
let data = {} as IPvGOData;
let boardStateGlobal = {} as IPvGOBoardState;
let validMovesGlobal = [] as boolean[][];
let fileGlobals = 'data/globals.json';
let globals = {} as Globals;

export type IPvGOData = {
  opponent: GoOpponent,
  // stores the moves made by the player in the current 
  moves: (Move | CheatMove)[]
  movesOpponent: (Point | null)[]
  boards: IPvGOBoardStateSimple[]
}
export type IPvGONode = {
  state: IPvGONodeState,
  controller: "X" | "O" | "?",
}
export type IPvGONodeState = "X" | "O" | "." | "#"; // black, white, empty, dead;
export type Point = { x: number, y: number }
export type Color = "X" | "O" | ".";
export type Move = { point: Point, type: (MoveType | 'CHEAT') }
export type EyeMove = { point: Point, createsLife: boolean }
export type TerritoryMove = { point: Point, delta: number }
export type MoveType = "CAPTURE" | "DEFEND" | "FREESPACE" | "CORNER" | "ENCIRCLE" | "RANDOM" | "EYECREATION" | "EYEBLOCK" | "CONNECTING" | "LIBERTY" | "SMOTHERING" | "RELIEVING" | "PASS";
export type CheatMove = { point: { x: number, y: number }, point2: { x: number, y: number }, type: "PlayTwoMoves" | "DestroyNode" };
// indexed by chain id, it will show all eyes which are adjacent to it, note that an eye is also a chain so can consist of multiple points
// hence each chain id contains a list of eyes (which is a list of points)
export type EyesByChainIDType = Map<number, Point[][]>;
const BLACK = "X";
const WHITE = "O";
const EMPTY = ".";
const DEAD = "#"
const size = test ? 7 : 13 // play on large boards as its easier to score some points

export type ChainMap = Map<number, ChainObject>
export type ChainObject = { points: Point[], state: IPvGONodeState, liberties: Point[], adjacentChains: number[] };
// count number of turns, starts at 1 and increases after this script makes a move
let turn = 1
export type IPvGOBoardStateSimple = IPvGONodeState[][]
export type IPvGOBoardState = IPvGoBoardStateWithChains & {
  eyesByChainIDWhite: EyesByChainIDType,
  eyesByChainIDBlack: EyesByChainIDType,
  pointsControlledWhite: number,
  pointsControlledBlack: number
}
/**
 * type with most important thing calculated. the rest is just some counters/helper attributes, but this object is basically initialised and can be passed around for calcluations
 */
export type IPvGoBoardStateWithChains = {
  points: IPvGONode[][],
  chains: (number | null)[][],
  chainMap: ChainMap,
}

export async function main(ns: NS) {
  globals = JSON.parse(ns.read(fileGlobals))
  data = ns.read(fileData) === '' ? {} : JSON.parse(ns.read(fileData));

  initialize(ns);
  ns.go.resetBoardState(data.opponent, size);

  let gameActive = true;
  turn = 1;
  while (gameActive) {
    // updates board, chains, valid moves and eyes
    updateGlobalBoardState(ns);
    await highlightTerritories(ns, boardStateGlobal);
    let moveToPlay: Move | CheatMove | undefined;


    moveToPlay = getCaptureOrDefendingMove(ns);
    if (moveToPlay === undefined) {
      // cheat moves
      moveToPlay = getCheatMovePlayTwo(ns);
    }
    if (moveToPlay === undefined) {
      moveToPlay = getCheatMoveDestroyNode(ns);
    }



    if (moveToPlay === undefined) {
      // contains both eye create and eye blocking moves
      moveToPlay = await getEyeMove(ns, boardStateGlobal);
    }
    if (moveToPlay === undefined) {
      moveToPlay = getCornerMove(ns, boardStateGlobal);
    }
    // dont play too many expensions in a row (5 for now) because it is also needed to connect some pieces
    if (moveToPlay === undefined) {
      moveToPlay = await getLibertyMove(ns);
    }
    if (moveToPlay === undefined) {
      moveToPlay = getRelievingMove(ns);
    }
    /*if (moveToPlay === undefined) {
      // do not play too many free space  mobes in a row
      if ((turn < 3 || (data.moves[data.moves.length - 1].type !== "FREESPACE" || data.moves[data.moves.length - 2].type !== "FREESPACE"))) {
        moveToPlay = getMaxFreeSpacesMove(ns);
      }
    }*/
    if (moveToPlay === undefined) {
      moveToPlay = getEncirclingMove(ns);
    }
    if (moveToPlay === undefined) {
      moveToPlay = getConnectingMove(ns);
    }

    if (moveToPlay === undefined) {
      moveToPlay = getRandomMove(ns);
    }
    let result = await playActualMove(ns, moveToPlay);

    let opponentMove = (result !== undefined && result.x != null && result.y != null) ? { x: result.x, y: result.y } : null
    turn++;
    data.movesOpponent.push(opponentMove)
    // checks if the move before the one current played and the last player move are both null, if true then the game ends
    // This is needed for the cheating case, I think what happens is if cheating fails then no result is returned
    // however then the previous move is still set to null so this check works as opposed to checking the result
    gameActive = result !== undefined && result.type !== "gameOver";

    /* // for debug/testing
     colorBlackEyes(ns);
     // pause a bit because otherwise a move will be immidately player, removing the highlighting
     ns.tprint('todo remove me sleep and continue with eye creation moves/eye defending')
     await ns.sleep(1000);*/
  }
  ns.write(fileData, JSON.stringify(data), 'w');
  ns.spawn(script, { spawnDelay: 0 });
}

/**
 * plays the move and handles updating some globals
 */
export async function playActualMove(ns: NS, move?: Move | CheatMove) {
  let opponentMove = null as Point | null;
  let result = undefined as {
    type: "gameOver" | "move" | "pass";
    x: number | null;
    y: number | null;
  } | undefined
  if (move === undefined) {
    // Pass turn if no moves are found
    await updateHUD(ns);
    data.moves.push({ point: { x: -1, y: -1 }, type: "PASS" });
    result = await ns.go.passTurn();
  }
  else if (move.type === "PlayTwoMoves" && move.point2 !== undefined) {
    data.moves.push(move ?? { point: { x: -1, y: -1 }, type: "RANDOM" });
    await updateHUD(ns);
    result = await ns.go.cheat.playTwoMoves(move.point.x, move.point.y, move.point2.x, move.point2.y);
  }
  else if (move.type === "DestroyNode") {
    data.moves.push(move ?? { point: { x: -1, y: -1 }, type: "RANDOM" });
    await updateHUD(ns);
    result = await ns.go.cheat.destroyNode(move.point.x, move.point.y);
  }
  else {
    data.moves.push(move ?? { point: { x: -1, y: -1 }, type: "RANDOM" });
    await updateHUD(ns);
    result = await ns.go.makeMove(move.point.x, move.point.y);
  }
  return result;
}

export function colorBlackEyes(ns: NS) {
  let allEyesIndexed = boardStateGlobal.eyesByChainIDBlack;
  if (allEyesIndexed === undefined) {
    boardStateGlobal.eyesByChainIDBlack = getAllEyesByChainId(ns, boardStateGlobal, BLACK);
  }
  allEyesIndexed = boardStateGlobal.eyesByChainIDBlack;

  for (const [key, eyes] of allEyesIndexed!.entries()) {
    for (const eye of eyes) {
      for (const point of eye) {
        ns.go.analysis.highlightPoint(point.x, point.y, "int", 'B EYE');
      }
    }
  }
}

export function colorWhiteEyes(ns: NS) {
  let allEyesIndexed = boardStateGlobal.eyesByChainIDWhite;
  if (allEyesIndexed === undefined) {
    boardStateGlobal.eyesByChainIDWhite = getAllEyesByChainId(ns, boardStateGlobal, WHITE);
  }
  allEyesIndexed = boardStateGlobal.eyesByChainIDWhite;

  for (const [key, eyes] of allEyesIndexed!.entries()) {
    for (const eye of eyes) {
      for (const point of eye) {
        ns.go.analysis.highlightPoint(point.x, point.y, "int", 'W EYE');
      }
    }

  }
}


export function printChainMap(ns: NS, chainMap?: Map<number, { points: Point[], state: IPvGONodeState, liberties: Point[], adjacentChains: number[] }>) {

  if (chainMap === undefined) {
    ns.tprint('Received an undefined chainMap which is unexpected!');
    return
  }
  for (const [key, value] of chainMap.entries()) {
    ns.tprint('key ', key);
    ns.tprint('state ', value.state);
    ns.tprint('liberties ', value.liberties);
    ns.tprint('points ', value.points);
  }

}
export function getCheatMovePlayTwo(ns: NS) {

  let cheatMove: CheatMove | undefined = undefined;
  // if there is a white chain with exactly 2 eyes and liberties (meaning the eyes are the only liberties).
  // Then return a cheat move to capture it
  for (const [key, eyes] of boardStateGlobal.eyesByChainIDWhite) {
    if (eyes === undefined) {
      continue;
    }
    if (eyes.length === 1 && eyes[0].length === 2) {
      let point = eyes[0][0];
      let point2 = eyes[0][1];
      cheatMove = { point, point2, type: "PlayTwoMoves" };
      break;
    }
    else if (eyes.length === 2 && eyes[0].length === 1 && eyes[1].length === 1) {
      let point = eyes[0][0];
      let point2 = eyes[1][0];
      cheatMove = { point, point2, type: "PlayTwoMoves" };
      break;
    }
  }

  // find a white chain with 2 liberties, among those return the one with the most nodes
  cheatMove = [...boardStateGlobal.chainMap.values()].reduce((best: ((CheatMove & { length: number }) | undefined), current) => {
    if (current.state === WHITE && current.liberties.length === 2 && current.points.length > 1 && (best === undefined || current.points.length > best.length)) {
      return { point: current.liberties[0], point2: current.liberties[1], type: "PlayTwoMoves", length: current.points.length }
    }
    return best
  }, undefined);

  return cheatMove;
}

export function getCheatMoveDestroyNode(ns: NS): CheatMove | undefined {

  let pointsLeftToPlay = numberContestedPoints(ns, boardStateGlobal);
  // cheat if behind and close to end of the game
  let gameState = ns.go.getGameState();
  let score = gameState.blackScore - gameState.whiteScore;
  // we dont wanna always cheat when behind, because there might be some even better moves to cheat
  // but we also do not wanna wait to the very end, because if cheat fails we pass which might end the game
  let doCheat = (pointsLeftToPlay < 10 && score < 0)
  if (doCheat === false) {
    return undefined;
  }

  let bestLengthChain = 0;
  let bestEyesLength = 100;
  let pointToPlay: Point | undefined = undefined;

  for (const [chain, eyes] of boardStateGlobal.eyesByChainIDWhite.entries()) {
    for (const eye of eyes) {
      if ((eye.length < bestEyesLength) || (eye.length === bestEyesLength && (boardStateGlobal?.chainMap?.get(chain)?.points.length ?? 0) > bestLengthChain)) {
        bestLengthChain = boardStateGlobal?.chainMap?.get(chain)?.points.length ?? 0;
        bestEyesLength = eye.length;
        pointToPlay = eye[0]; // disabling any point of the eye is OK, it doesnt matter which
      }
    }
  }
  if (pointToPlay === undefined) {
    return undefined;
  }

  return { point: pointToPlay, point2: { x: -1, y: -1 }, type: "DestroyNode" }
}

// highlight territories for all empty spaces, either black white or ???
export async function highlightTerritories(ns: NS, boardStateInput: IPvGOBoardState) {
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let controller = boardStateInput.points[x][y].controller
      if (controller !== '?') {
        ns.go.analysis.highlightPoint(x, y, undefined, controller);
      }
    }
  }
  /*
    ns.tprint('sleep highlight territories');
    await ns.sleep(1000);
  */
}
export function initialize(ns: NS) {
  resetData(ns);
  if (hardcodedFactionToPlay !== undefined) {
    data.opponent = hardcodedFactionToPlay;
    return;
  }
  // assign factionToPlay
  switch (data.opponent) {
    case ns.enums.FactionName.TheBlackHand:
      data.opponent = ns.enums.FactionName.Daedalus;
      break
    case ns.enums.FactionName.Daedalus:
      data.opponent = ns.enums.FactionName.Illuminati;
      break;/*
    case ns.enums.FactionName.Illuminati:
      data.opponent = ns.enums.FactionName.SlumSnakes;
      break;
    case data.opponent = ns.enums.FactionName.SlumSnakes:
      data.opponent = ns.enums.FactionName.Tetrads;
      break;*/
    default:
      data.opponent = ns.enums.FactionName.TheBlackHand;
  }
  if (ns.singularity.getOwnedAugmentations().includes('The Red Pill')) {
    data.opponent = '????????????';
  }
  if (test) {
    data.opponent = 'No AI';
  }
}
/*
 * creates and updates state variables used globally such that they only have to be computed once
 * consider refactoring this such that the information is included in a single object?... 
 */
export function updateGlobalBoardState(ns: NS) {
  let simpleGlobalBoard = getSimpleBoardState(ns);
  boardStateGlobal = createIPvGOBoardState(ns, simpleGlobalBoard);
  // do not pass in board, as then the valid modes does not account for previous modes
  validMovesGlobal = ns.go.analysis.getValidMoves();
}

export function getSimpleBoardState(ns: NS) {
  let boardState = ns.go.getBoardState();
  let boardStateAsMatrix: IPvGOBoardStateSimple = [];
  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    let column: IPvGONodeState[] = []
    for (let y = 0; y < size; y++) {
      column.push(boardState[x][y] as IPvGONodeState);
    }
    boardStateAsMatrix.push(column);
  }
  return boardStateAsMatrix;
}

/**
 * creates a a chain matrix, mapping each point to a unique chain id
 */
function getChainsMatrix(ns: NS, boardStateLocal: {
  points: { state: IPvGONodeState }[][]
}) {
  let chainCount = 0;
  let chains: (number | null)[][] = [];
  for (let i = 0; i < size; i++) {
    chains[i] = [];
  }

  function updateChainIDs(ns: NS, chainIDnew: number, chainIDOld: number) {
    // update all chains with the old chainID to the new one
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        if (chains[x][y] === chainIDOld) {
          chains[x][y] = chainIDnew;
        }
      }
    }
  }
  // construct chain IDs.
  // start from 0, then for each point, of no adjacent point of the same state has a chainID, assign a new one and increase counter
  // else take over from adjacent point
  for (let x = 0; x < size; x++) {
    chains[x] = [];
    for (let y = 0; y < size; y++) {
      let currentState = boardStateLocal.points[x][y].state;
      if (currentState === DEAD) {
        chains[x][y] = null;
      }
      else {
        let point = { x, y }
        let adjacentPoints = getAdjacentPointsByState(ns, boardStateLocal, point, currentState).filter((c) => chains[c.x][c.y] !== undefined);
        if (adjacentPoints.length === 0) {
          chains[x][y] = chainCount;
          chainCount++;
        }
        else {
          let chainIDs = [...new Set(adjacentPoints.map((p) => chains[p.x][p.y]))];
          if (chainIDs.length === 0) {
            chains[x][y] = chainCount;
            chainCount++;
            continue;
          }
          let newChainID = chainIDs[0];
          // type check, shouldnt happen because the points are filtered by state which is not dead
          if (newChainID === null) {
            continue;
          }
          chains[x][y] = newChainID;
          for (let i = 1; i < chainIDs.length; i++) {
            let oldChainID = chainIDs[i];
            if (oldChainID === null) {
              continue;
            }
            if (chainIDs[i] !== null && chainIDs[i] !== newChainID) {
              // all adjacent chains are 'merged' so set all their ids to the new id
              updateChainIDs(ns, newChainID, oldChainID);
            }

          }
        }
      }
    }
  }
  return chains;
}

/*
 * based on input chains object (i.e.)
 * returns a map with key the identifier of the chain, and contents an array of the points in the chain
*/
export function getChainMap(ns: NS, boardStateLocal: {
  points: { state: IPvGONodeState }[][]
}, chains: (number | null)[][]) {
  let chainMap = new Map<number, { points: Point[], state: IPvGONodeState }>();

  // first construct chainMap which specifies for each chain all its points.
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y }
      let chainOfPoint = chains[x][y];
      if (chainOfPoint === null) {
        continue;
      }
      if (chainMap.has(chainOfPoint)) {
        chainMap.get(chainOfPoint)!.points.push(point);
      } else {
        chainMap.set(chainOfPoint, { points: [point], state: boardStateLocal.points[point.x][point.y].state })
      };
    }
  }
  // using this chainmap, also add the liberties and adjacentChains to a new map and return that
  let UpdatedchainMap = new Map<number, { points: Point[], state: IPvGONodeState, liberties: Point[], adjacentChains: number[] }>();
  // get the liberties (the empty adjacent nodes) and adjacent chains of each chain i.e. 
  for (const [key, chain] of chainMap.entries()) {
    let liberties = getAdjacentPointsForSet(ns, chain.points).filter((p) => boardStateLocal.points[p.x][p.y].state === EMPTY);
    let adjacentChains = getAdjacentChains(ns, chains, chain.points);
    UpdatedchainMap.set(key, {
      ...chain,
      liberties: liberties,
      adjacentChains: adjacentChains
    })
  }

  return UpdatedchainMap;
}



// captures enemy node by placing next to a node with liberty 1
export function getCaptureOrDefendingMove(ns: NS): Move | undefined {
  const moveOptions = [] as Move[];
  // Look through all the points on the board
  let bestMove: Move & { score: number } | undefined = undefined;
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y }
      // Make sure the point is a valid move
      const isValidMove = validMovesGlobal[x][y];
      if (isValidMove) {
        // check for a capture move
        let lowestLibertyChainAdjacentWhite = getLowestLibertyChain(ns, boardStateGlobal, point, WHITE);
        if (lowestLibertyChainAdjacentWhite && lowestLibertyChainAdjacentWhite.liberties.length === 1) {
          let score = lowestLibertyChainAdjacentWhite.points.length;
          if (score > (bestMove?.score ?? 0)) {
            bestMove = { point, type: "CAPTURE", score }
          }
        }
        // check for a defending move
        // the defending move must also be useful, i.e. it grants new adjacent empty spaces OR it connects two different chains
        if ((adjacentEmpty(ns, boardStateGlobal, point) >= 2) || isEmptyPointBetweenTwoChains(ns, boardStateGlobal, point, BLACK)) {
          let lowestLibertyChainAdjacentBlack = getLowestLibertyChain(ns, boardStateGlobal, point, BLACK);
          if (lowestLibertyChainAdjacentBlack && lowestLibertyChainAdjacentBlack.liberties.length <= 1) {
            if (lowestLibertyChainAdjacentBlack.liberties.length === 0) {
            }
            let score = lowestLibertyChainAdjacentBlack.points.length;
            // doing >= here makes defence prefered over capture
            if (score >= (bestMove?.score ?? 0)) {

              bestMove = { point, type: "DEFEND", score }
            }
          }
        }
      }
    }
  }
  if (bestMove === undefined) {
    return undefined;
  }
  else {
    return bestMove;
  }
}

// defends an threathed network which currently has 2 liberty and next to white
export function getRelievingMove(ns: NS): Move | undefined {
  const moveOptions = [] as Move[];
  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y };
      // Make sure the point is a valid move
      const isValidMove = validMovesGlobal[x][y];
      if (isValidMove && boardStateGlobal.points[x][y].controller === '?') {
        let chainMap = boardStateGlobal.chainMap;
        let chains = boardStateGlobal.chains;
        let adjadentChainsToCheck: number[] = [];
        // there is an adjacent black node with 2 liberty (vulnerable), and the chain is next to white (contested)
        let adjacentPointToRelieve = getAdjacentPoints(ns, point).find((p) => {
          if (boardStateGlobal.points[p.x][p.y].state === BLACK) {
            let chain = chainMap.get(chains[p.x][p.y] ?? -2);
            if (chain !== undefined && chain.liberties.length === 2) {
              adjadentChainsToCheck = chain.adjacentChains;
              return true;
            }
          }
        })


        let isContested = adjacentPointToRelieve && getAdjacentPoints(ns, adjacentPointToRelieve).find((p) => boardStateGlobal.points[p.x][p.y].state === WHITE);
        // the defending move must also be useful, i.e. it grants new adjacent empty spaces OR it connects two different chains
        if (isContested && (adjacentEmpty(ns, boardStateGlobal, point) === 2) || isEmptyPointBetweenTwoChains(ns, boardStateGlobal, point, BLACK)) {
          moveOptions.push({ point, type: "RELIEVING" })
        }
      }
    }
  }
  // Choose one of the found moves at random
  const randomIndex = Math.floor(Math.random() * moveOptions.length);
  return moveOptions[randomIndex]
}

// get moves which are encircling empty space,
// i.e. adjacent to two empty points, and adjacent to either two friendsly chainsGlobal, or friendly chain and edge of board
export function getEncirclingMove(ns: NS): Move | undefined {

  const moveOptions = [] as Move[];

  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y };
      // Make sure the point is a valid move
      const isValidMove = validMovesGlobal[x][y];
      if (isValidMove && boardStateGlobal.points[x][y].controller === '?') {
        let adjacentPoints = getAdjacentPoints(ns, point);
        // next to two empty points
        if (adjacentEmpty(ns, boardStateGlobal, point) === 2) {
          // is adjacent to two black different chainsGlobal
          if (isEmptyPointBetweenTwoChains(ns, boardStateGlobal, point, BLACK)
            //OR adjacent to BLACK and edge 
            || (adjacentPoints.some((point) => boardStateGlobal.points[point.x][point.y].state === BLACK)
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

// connect two friendly chains
export function getConnectingMove(ns: NS): Move | undefined {
  const moveOptions = [] as Move[];
  let AllBlackEyePoints = [...boardStateGlobal.eyesByChainIDBlack.values()].flat(2);

  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y }
      // Make sure the point is a valid move
      const isValidMove = validMovesGlobal[x][y];
      // exclude connecting eyes, there is no need to fill in an eye (actually thats the opposite of what we want to do with eyes)
      if (AllBlackEyePoints.some((blackEyePoint) => blackEyePoint.x === x && blackEyePoint.y === y)) {
        continue;
      }
      if (isValidMove && boardStateGlobal.points[x][y].controller === '?' && isEmptyPointBetweenTwoChains(ns, boardStateGlobal, point, BLACK)) {
        moveOptions.push({ point, type: "CONNECTING" },);

      }
    }
  }
  // Choose one of the found moves at random
  const randomIndex = Math.floor(Math.random() * moveOptions.length);
  return moveOptions[randomIndex]
}

/**
 * returns the move which grants the most liberties for black or decreases the most liberties from white
 * Similar to growth move of AI
 */
export async function getLibertyMove(ns: NS): Promise<Move | undefined> {

  // first check all liberty gain moves next to adjacent liberties
  let liberties = getLibertiesAsArray(ns, boardStateGlobal, BLACK);
  let libertiesWhite = getLibertiesAsArray(ns, boardStateGlobal, WHITE);
  let adjacentOfLiberties = getAdjacentPointsForSet(ns, liberties).filter((p) => boardStateGlobal.points[p.x][p.y].state === EMPTY);

  let bestScore = 0;
  let bestPoint: Point | undefined = undefined

  for (const point of adjacentOfLiberties) {
    if (!validMovesGlobal[point.x][point.y]) {
      continue;
    }
    // search for moves next to current liberties, 
    let score = getAdjacentPointsByState(ns, boardStateGlobal, point, EMPTY).length - getAdjacentPointsByState(ns, boardStateGlobal, point, BLACK).length + getAdjacentPointsByState(ns, boardStateGlobal, point, WHITE).length;
    if (score > bestScore) {
      bestScore = score;
      bestPoint = point;
    }

  }
  if (bestPoint === undefined) {
    return undefined;
  }
  return { point: bestPoint, type: 'LIBERTY' };
}

// put empty chain to 1 liberty, not used for now because of getExpensionOrSmothering, but this smothering might be better
export function getSmotheringMove(ns: NS): Move | undefined {
  const moveOptions = [] as Move[];
  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y }
      // Make sure the point is a valid move
      // the node will reduce the liberties of a white chain to 1
      const isValidMove = validMovesGlobal[x][y];
      if (isValidMove && boardStateGlobal.points[x][y].controller === '?'
        && (getLowestLibertyChain(ns, boardStateGlobal, point, WHITE)?.liberties.length ?? 0) === 2
        // also do not get captured back immidiately
        && (getAdjacentLibertiesForEmpty(ns, boardStateGlobal, point, BLACK) > 1
          || adjacentEmpty(ns, boardStateGlobal, point) >= 2)) {
        moveOptions.push({ point, type: "SMOTHERING" });
      }
    }
  }

  const randomIndex = Math.floor(Math.random() * moveOptions.length);
  return moveOptions[randomIndex]
}


// return all moves which are adjacent to 4 empty spaces
export function getMaxFreeSpacesMove(ns: NS): Move | undefined {
  const moveOptions = [] as Move[];
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y }
      // Make sure the point is a valid move
      const isValidMove = validMovesGlobal[x][y];
      if (isValidMove && boardStateGlobal.points[x][y].controller === '?' && isFreeSpaceMove(ns, boardStateGlobal, BLACK, point)) {
        moveOptions.push({ point, type: "FREESPACE" })
      }
    }
  }
  // Choose one of the found moves at random
  const randomIndex = Math.floor(Math.random() * moveOptions.length);
  return moveOptions[randomIndex];
}
const getRandomMove = (ns: NS): Move | undefined => {
  const moveOptions = [] as Move[];
  const board = ns.go.getBoardState() as IPvGONodeState[];
  // Look through all the points on the board
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let point = { x, y };
      // Make sure the point is a valid move
      const isValidMove = validMovesGlobal[x][y];

      if (isValidMove && boardStateGlobal.points[x][y].controller === '?') {
        moveOptions.push({ point, type: "RANDOM" });
      }
    }
  }

  // Choose one of the found moves at random
  const randomIndex = Math.floor(Math.random() * moveOptions.length);
  return moveOptions[randomIndex];
};

export async function getEyeMove(ns: NS, board: IPvGOBoardState): Promise<Move | undefined> {
  // filter move on valid, this is needed because the below methods do not evaluate based on the full history of moves so could lead to duplicate moves
  let eyeMovesForBlack = getEyeCreationMoves(ns, board, BLACK).filter((m) => validMovesGlobal[m.point.x][m.point.y]);
  let eyeMovesForWhite = getEyeCreationMoves(ns, board, WHITE).filter((m) => validMovesGlobal[m.point.x][m.point.y]);

  // debugging, highlight the moves!
  if (test) {
    if (eyeMovesForBlack.length + eyeMovesForWhite.length > 0) {
      for (const m of eyeMovesForBlack) {
        let text = "EMB";
        if (m.createsLife) { text += '!!' }
        ns.go.analysis.highlightPoint(m.point.x, m.point.y, 'int', text);
      }
      for (const m of eyeMovesForWhite) {
        let text = "EMW";
        if (m.createsLife) { text += '!!' }
        ns.go.analysis.highlightPoint(m.point.x, m.point.y, 'int', text);
      }
      colorBlackEyes(ns);
      colorWhiteEyes(ns);
    }
  }
  if (eyeMovesForBlack.length > 0) {
    return { point: eyeMovesForBlack[0].point, type: "EYECREATION" }
  }
  if (eyeMovesForWhite.length > 0) {
    for (const eyeBlockingMove of eyeMovesForWhite) {
      // only play eye blocking move if it will not get captures
      let point = eyeBlockingMove.point;
      if (getAdjacentPointsByState(ns, boardStateGlobal, point, BLACK).length + adjacentEmpty(ns, boardStateGlobal, point) >= 2) // is thie >= 3 even possible for eye block? {
        return { point: eyeMovesForWhite[0].point, type: "EYEBLOCK" }
    }
  }

  return undefined
}
/**
 * Finds all moves that would create an eye for the given player.
 *
 * An "eye" is empty point(s) completely surrounded by a single player's connected pieces.
 * If a chain has multiple eyes, it cannot be captured by the opponent (since they can only fill one eye at a time,
 *  and suiciding your own pieces is not legal unless it captures the opponents' first)
 */
function getEyeCreationMoves(ns: NS, board: IPvGOBoardState, color: Color) {
  // TODO refactor object model such that the logic for identifying eyes is in one place?
  let currentEyes: EyesByChainIDType = new Map();
  let chains = board.chains;
  let chainMap = board.chainMap;
  if (color === BLACK) {
    if (board.eyesByChainIDBlack === undefined) {
      board.eyesByChainIDBlack = getAllEyesByChainId(ns, board, color);
    }
    currentEyes = board.eyesByChainIDBlack;
  }
  else {
    if (board.eyesByChainIDWhite === undefined) {
      board.eyesByChainIDWhite = getAllEyesByChainId(ns, board, color);
    }
    currentEyes = board.eyesByChainIDWhite;
  }

  // group is living if it has 2 or more eyes
  let currentLivingGroupIDs = [];
  // a group first needs 1 eye to get two, so having 1 eye is also an important property
  let currentGroupsWithEye = 0;
  for (const [key, value] of currentEyes.entries()) {
    if (value.length >= 2) {
      currentLivingGroupIDs.push(key);
    }
    if (value.length > 1) {
      currentGroupsWithEye++;
    }
  }
  const currentLivingGroupsCount = currentLivingGroupIDs.length;


  // get points which potentially can create new usefull eyes
  // these are from the liberties (open points) next to player chains
  let validMoves = ns.go.analysis.getValidMoves(toStringRepresentation(ns, board));
  let pointsToConsider = new Set<string>();
  for (const [key, value] of chainMap.entries()) {
    let points = value.points;
    // first check properties of chain
    if (value.state === color && points.length > 1 && !currentLivingGroupIDs.includes(key)) {
      for (const liberty of value.liberties) {
        // then also check if it would be a valid move
        if (validMoves[liberty.x][liberty.y]) {
          pointsToConsider.add(JSON.stringify(liberty))
        }
      }
    }
  }
  // get array of relative good potential points on which to move
  // apply some quick filters to narrow down moves which could create an eye
  let pointsToEvaluate = Array.from(pointsToConsider).map((p) => JSON.parse(p) as Point).filter((p) => {
    let adjacentPoints = getAdjacentPoints(ns, p);
    // for the move to create an eye, there need to be at least 2 adjacent stones of the player, and there needs to be an empty space adjacent
    return (adjacentPoints.filter((p) => board.points[p.x][p.y].state === color).length >= 2
      && adjacentPoints.some((p) => board.points[p.x][p.y].state === EMPTY)
    )
  })

  const eyeCreationMoves = pointsToEvaluate.reduce((moveOptions: EyeMove[], point: Point) => {
    let evaluationBoard = playMoveAndUpdate(ns, board, { x: point.x, y: point.y }, color);
    // get new eyes
    const newEyes = getAllEyesByChainId(ns, evaluationBoard, color);
    let newLivingGroupIDs = [];
    let newGroupsWithEye = 0;
    for (const [key, value] of newEyes.entries()) {
      if (value.length >= 2) {
        newLivingGroupIDs.push(key);
      }
      if (value.length > 1) {
        newGroupsWithEye++;
      }
    }
    const newLivingGroupsCount = newLivingGroupIDs.length;
    // if there are new Groups with an eye (and no less living groups) the move is OK
    // even better is if the moves creates a new second eye, which is defined with the createsLife boolean
    if (
      newLivingGroupsCount > currentLivingGroupsCount ||
      (newGroupsWithEye > currentGroupsWithEye && newLivingGroupsCount === currentLivingGroupsCount)
    ) {
      moveOptions.push({
        point: point,
        createsLife: newLivingGroupsCount > currentLivingGroupsCount,
      });
    }
    return moveOptions;
  }, []);

  return eyeCreationMoves.sort((moveA, moveB) => +moveB.createsLife - +moveA.createsLife);
}

/**
 * This function also removes any chains with 0 liberties
 * @param boardState board state before the move
 * @param point the point on which to play the move
 * @param color player who makes the move
 */
export function playMoveAndUpdate(ns: NS, boardState: IPvGOBoardState, point: Point, color: Color) {
  let simpleCopy = getSimpleCopy(ns, boardState);
  simpleCopy[point.x][point.y] = color;
  // create a board with chains, used to determine what to remove
  let boardWithChains = createIPvGOBoardStateWithChains(ns, simpleCopy);
  // remove chains, and get a simple copy again because it needs to be initialized
  let simpleCopyUpdated = removeCapturedChains(ns, boardWithChains, color);
  // now fully initialyze the board
  let boardUpdatedWithChains = createIPvGOBoardState(ns, simpleCopyUpdated);
  return boardUpdatedWithChains;
}

/**
 * returns all liberties for the input color
 */
export function getLibertiesAsArray(ns: NS, boardStateLocal: IPvGoBoardStateWithChains, color: Color): Point[] {
  let liberties = new Map<string, Point>();
  for (const c of boardStateLocal.chainMap.values().filter((chain) => chain.state === color)) {
    for (const liberty of c.liberties) {
      liberties.set(`${liberty.x},${liberty.y}`, liberty)
    }
  }
  return [...liberties.values()]
}

/**
 *
 *
 * @export removed captured chains from the board
 * @param  boardState
 * @param colorOfChainsToRemove,only remove stones of this color (i.e. player who last made a move)
 * @return simple board state, as the board has to be updated again
 * 
 */
export function removeCapturedChains(ns: NS, boardState: IPvGoBoardStateWithChains, colorOfChainsToRemove: Color): IPvGOBoardStateSimple {
  let boardStateSimple = getSimpleCopy(ns, boardState);
  for (const [key, value] of boardState.chainMap.entries()) {
    if (value.state === colorOfChainsToRemove && value.liberties.length === 0) {
      for (const pointToRemove of value.points) {
        boardStateSimple[pointToRemove.x][pointToRemove.y] = EMPTY;
      }
    }
  }
  return boardStateSimple;
}
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

/** 
 * returns all points adjacent (up down left or right) to the input point
 * dead nodes are also returned, this only filters out nodes outside of the boards
 * and notes which are already part of the input set
 */
export function getAdjacentPointsForSet(ns: NS, points: Point[]) {
  let adjacentPoints = new Set<string>();
  for (const point of points) {
    let adjacentOfPoint = getAdjacentPoints(ns, point);
    for (const p of adjacentOfPoint) {
      // do not add points already part of the input set
      if (points.every((ip) => ip.x !== p.x || ip.y !== p.y))
        adjacentPoints.add(JSON.stringify(p));
    }
  }

  let uniqueAdjacent = Array.from(adjacentPoints).map(p => JSON.parse(p) as Point);
  return uniqueAdjacent;
}

/**
 * returns all adjacent points filtered by the input state
 */
export function getAdjacentPointsByState(ns: NS, boardStateInput: {
  points: { state: IPvGONodeState }[][]
}, point: Point, state: IPvGONodeState): Point[] {
  let adjacentPoints = getAdjacentPoints(ns, point);
  return adjacentPoints.filter((p) => boardStateInput.points[p.x][p.y].state === state)
}


/**
 * returns the number of adjacent empty points
 */
export function adjacentEmpty(ns: NS, boardState: IPvGOBoardState, point: Point) {
  return getAdjacentPointsByState(ns, boardState, point, EMPTY).length;
}


/**
 *
 * returns the total number of liberties for the input player and board
 */
export function getNumberOfLiberties(ns: NS, boardStateInput: IPvGoBoardStateWithChains, color: Color) {
  return boardStateInput.chainMap.values().filter((c) => c.state === color).reduce((prev, c) => prev + c.liberties.length, 0);
}

/**
 *
 *
 * @export returns TRUE if the input point has: 
 * - empty space in the 4 directions directly adjacent
 * - the rest of the 4 neighbors ( diagonal) and 4 further neighbors ( 2 up, down,left,right) are also empty or has same color
 * - the 4 directi
 * @param point the point to check
 */
export function isFreeSpaceMove(ns: NS, board: IPvGoBoardStateWithChains, color: Color, point: Point) {
  let checkEmpty = getAdjacentPoints(ns, point);
  if (checkEmpty.length !== 4) {
    return false;
  }

  let checkEmptyOrOwn = getDiagonalAdjacent(ns, point).concat(getTwoAdjacent(ns, point));
  if (checkEmptyOrOwn.length !== 8) {
    return false;
  }
  const allowedStates = [color, EMPTY];
  let isFreeSpaceMove = checkEmpty.every((p) => board.points[p.x][p.y].state === EMPTY)
    && checkEmptyOrOwn.every((p) => allowedStates.includes(board.points[p.x][p.y].state))
  return isFreeSpaceMove;
}


/**
 * @export returns the 4 diagonal adjacent points to the input point
 * @param {NS} ns
 */
export function getDiagonalAdjacent(ns: NS, point: Point) {
  let points = [] as Point[];

  if (point.x > 0 && point.y > 0) { points.push({ x: point.x - 1, y: point.y - 1 }) }
  if (point.x > 0 && point.y < size - 1) { points.push({ x: point.x - 1, y: point.y + 1 }) }
  if (point.x < size - 1 && point.y > 0) { points.push({ x: point.x + 1, y: point.y - 1 }) }
  if (point.x < size - 1 && point.y < size - 1) { points.push({ x: point.x + 1, y: point.y + 1 }) }

  return points;
}
/**
 * @export returns the 4 two-adjacent points to the input point i.e. 2 up,down,left,right
 * @param {NS} ns
 */
export function getTwoAdjacent(ns: NS, point: Point) {
  let points = [] as Point[];
  if (point.x > 1) { points.push({ x: point.x - 2, y: point.y }) }
  if (point.y > 1) { points.push({ x: point.x, y: point.y - 2 }) }
  if (point.x < size - 2) { points.push({ x: point.x + 2, y: point.y }) }
  if (point.y < size - 2) { points.push({ x: point.x, y: point.y + 2 }) }

  return points;
}


/**
 *
 *
 * @export returns TRUE if the input point has empty adjacent points, and the diagonals contain a friendly empty point
 * @param  point
 */
export function hasDiagonalAdjacentAndEmptyAdjacent(ns: NS, boardStateInput: {
  points: { state: IPvGONodeState }[][]
}, point: Point, color: Color) {
  return getAdjacentPoints(ns, point).every((p) => boardStateInput.points[p.x][p.y].state === EMPTY)
    && getDiagonalAdjacent(ns, point).some((p) => boardStateInput.points[p.x][p.y].state === color);
}

export function isCornerMove(ns: NS, boardStateInput: { points: { state: IPvGONodeState }[][] }, point: Point) {

}



/**
 * Get a move that places a piece to influence (and later control) a corner
 * Searches all 3x3 corners and returns any of the most inside point if the corner is mainly intact
 */
function getCornerMove(ns: NS, boardStateInput: {
  points: { state: IPvGONodeState }[][]
}): Move | undefined {
  const cornerMax = size - 3;
  const bound = size - 1;
  if (isCornerAvailableForMove(ns, boardStateInput, cornerMax, cornerMax, bound, bound)) {
    return { point: { x: cornerMax, y: cornerMax }, type: 'CORNER' }
  }
  if (isCornerAvailableForMove(ns, boardStateInput, 0, cornerMax, 2, bound)) {
    return { point: { x: 2, y: cornerMax }, type: 'CORNER' }
  }
  if (isCornerAvailableForMove(ns, boardStateInput, 0, 0, 2, 2)) {
    return { point: { x: 2, y: 2 }, type: 'CORNER' }
  }
  if (isCornerAvailableForMove(ns, boardStateInput, cornerMax, 0, bound, 2)) {
    return { point: { x: cornerMax, y: 2 }, type: 'CORNER' }
  }
  return undefined;
}

/**
 * Returns TRUE if corner has most points empty, indicating it is a good move
 */
function isCornerAvailableForMove(ns: NS, boardStateInput: {
  points: { state: IPvGONodeState }[][]
}, minx: number, miny: number, maxx: number, maxy: number) {
  const foundPoints = getLiveNodesInArea(ns, boardStateInput, minx, miny, maxx, maxy);
  const numberOfPieces = foundPoints.reduce((prev, p) => prev + +([BLACK, WHITE].includes(boardStateGlobal.points[p.x][p.y].state)), 0)
  return foundPoints.length >= 7 ? numberOfPieces === 0 : false;
}

/**
 * Find all non-offline nodes in a given area
 */
export function getLiveNodesInArea(ns: NS, boardStateInput: {
  points: { state: IPvGONodeState }[][]
}, minx: number, miny: number, maxx: number, maxy: number) {
  const foundPoints: Point[] = [];
  for (let x = minx; x <= maxx; x++) {
    for (let y = miny; y <= maxy; y++) {
      if (boardStateInput.points[x][y].state === DEAD) {
        continue;
      }
      foundPoints.push({ x, y });
    }
  }
  return foundPoints;
}




// returns TRUE if the two input points belong to the same chain
export function areInSameChain(ns: NS, boardStateInput: IPvGOBoardState, pointA: Point, pointB: Point) {
  let chains = boardStateInput.chains;
  let areInSameChain = chains[pointA.x][pointA.y] === chains[pointB.x][pointB.y];
  return areInSameChain;
}

export function isOnEdge(ns: NS, point: Point) {
  let x = point.x;
  let y = point.y;
  return x === 0 || y === 0 || x === size - 1 || y === size - 1;
}


/**
 * retrieves the chain numbers of all input points
 * @return {returns the chains (by number[]) for all the input points.} 
 */

export function getChainsOfPoints(ns: NS, boardStateInput: IPvGoBoardStateWithChains, points: Point[]) {
  let chainsAdjacent = new Set<number>();
  for (const point of points) {

    let chain = boardStateInput.chains[point.x][point.y];
    if (chain !== null) {
      chainsAdjacent.add(chain);
    }
  }

  return [...chainsAdjacent];
}


/**
 * chains of points in the input set are not returned
 * if the input is all points of a chain, then this will give all adjacent chains of that chain (so excluding that input chain) 
 * input only requires partially intialised IPvGOBoardState object, this will calculate adjacency of chains
 * @return {returns the adjacent chains (by number[]) for all the input points.} 
 */

export function getAdjacentChains(ns: NS, chains: (number | null)[][],
  points: Point[]) {
  let chainsAdjacent = new Set<number>();
  let adjacentPoints = getAdjacentPointsForSet(ns, points);
  for (const point of adjacentPoints) {

    let chain = chains[point.x][point.y];
    if (chain !== null) {
      chainsAdjacent.add(chain);
    }
  }

  return [...chainsAdjacent];
}

// returns TRUE if the input point is an empty point, and it connects two different chainsGlobal of the input color
export function isEmptyPointBetweenTwoChains(ns: NS, boardStateInput: IPvGOBoardState, point: Point, color: Color) {

  let isEmpty = boardStateInput.points[point.x][point.y].state === EMPTY;
  if (!isEmpty) { return false }
  let foundDifferentChainsOfColor = false;
  let adjacentPoints = getAdjacentPoints(ns, point);
  adjacentPoints = adjacentPoints.filter((point) => boardStateInput.points[point.x][point.y].state === color);
  for (let i = 0; i < adjacentPoints.length; i++) {
    for (let j = i + 1; j < adjacentPoints.length; j++) {
      if (!areInSameChain(ns, boardStateInput, adjacentPoints[i], adjacentPoints[j])) {
        foundDifferentChainsOfColor = true;
        break;
      }
    }
  }
  return foundDifferentChainsOfColor;
}
// returns the amount of liberties adjacent of the input point
export function getAdjacentLibertiesForEmpty(ns: NS, boardStateInput: IPvGoBoardStateWithChains, point: Point, color: Color) {
  let chains = boardStateInput.chains
  let chainMap = boardStateInput.chainMap;

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
  let liberties = [...chainsLocal].reduce((prev, c) => prev + (chainMap.get(c)?.liberties.length ?? 0), 0);
  return liberties;
}


/**
 * returns the lowest liberty chain adjacent to the input point and of input color
 */
export function getLowestLibertyChain(ns: NS, boardStateInput: IPvGoBoardStateWithChains, point: Point, color: Color) {
  let chains = boardStateInput.chains;
  let chainMap = boardStateInput.chainMap;

  let adjacentPoints = getAdjacentPointsByState(ns, boardStateInput, point, color);
  let chainsToCheck = new Set<number>();
  for (const adjacentPoint of adjacentPoints) {
    let chain = chains[adjacentPoint.x][adjacentPoint.y];
    if (chain === null) {
      continue;
    }
    chainsToCheck.add(chain);
  }

  // all points in chain have the same liberty!

  let lowestLibertyChain = [...chainsToCheck].reduce((prev: ChainObject | undefined, c) => ((chainMap.get(c)?.liberties.length ?? 999) < (prev?.liberties.length ?? 999)) ? chainMap.get(c) : prev, undefined);
  return lowestLibertyChain;
}

export function resetData(ns: NS) {
  // reset data for new game
  data.moves = [];
  data.movesOpponent = [];
}
/**
 * returns a simple board state (only node state at each position, used to change nodes and recalculate)
 * @param ns 
 * @param IPvGOBoardState the board state to copy 
 */
export function getSimpleCopy(ns: NS, boardState: {
  points: IPvGONode[][]
}): IPvGOBoardStateSimple {
  return boardState.points.map(row => row.map(point => point.state));
}


/**
 * returns a board state which is sufficient for most purposes, except some calculations
 * defined this way in order to avoid circularity needed when calculating the all eyes
 * @param ns 
 * @param IPvGOBoardStateSimple the board state to calculate
 * @returns 
 */
export function createIPvGOBoardStateWithChains(ns: NS, boardSimple: IPvGOBoardStateSimple,): IPvGoBoardStateWithChains {
  let partialBoard: {
    points: { state: IPvGONodeState, controller: 'X' | 'O' | '?', chain: number }[][]
  } = { points: [] };
  for (let x = 0; x < size; x++) {
    let col: { state: IPvGONodeState, controller: 'X' | 'O' | '?', chain: number }[] = []
    for (let y = 0; y < size; y++) {
      // initialize controller with black or white if the coller is placed, otherwise with ?
      // later (after chain and eyes are calcualted) the controller will be updated
      col.push({ state: boardSimple[x][y], controller: [EMPTY, DEAD].includes(boardSimple[x][y]) ? '?' : boardSimple[x][y] as ("X" | "O"), chain: -1 })
    }
    partialBoard.points.push(col);
  }
  let chains = getChainsMatrix(ns, partialBoard);
  let chainMap = getChainMap(ns, partialBoard, chains);

  // set chain on each point, might be usefull for analysis.
  // if there is no chain then assign default -1
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let chain = (chains[x][y] === null) ? -1 : chains[x][y] as number
      partialBoard.points[x][y].chain = chain;
    }
  }
  let partialBoardWithChains = { ...partialBoard, chains: chains, chainMap: chainMap };
  return partialBoardWithChains;
}

/**
 *
 *
 * @export creates an updated board state WITHOUT checking if stones need to be removed, for that use the copy and playMoveAndUpdate method
 * @param {NS} ns
 * @param {IPvGOBoardStateSimple} boardSimple
 * @return the fully functional board state
 */
export function createIPvGOBoardState(ns: NS, boardSimple: IPvGOBoardStateSimple): IPvGOBoardState {

  let boardWithChains = createIPvGOBoardStateWithChains(ns, boardSimple);

  let eyesByChainIDBlack = getAllEyesByChainId(ns, boardWithChains, BLACK);
  let eyesByChainIDWhite = getAllEyesByChainId(ns, boardWithChains, WHITE);

  let boardWithEyes = { ...boardWithChains, eyesByChainIDBlack, eyesByChainIDWhite };
  let counters = updateTerritory(ns, boardWithEyes);

  // only copy the board, as the board will be modified eyes should be calculated for it afterwards
  let boardCopy = { ...boardWithEyes, ...counters }
  return boardCopy;
}

/**
 * @export updates the territory and chains in place
 * @param {NS} ns
 * @param {IPvGOBoardState} boardState assumes all is complete except controller, eye objects are used!
 */
export function updateTerritory(ns: NS, boardState: IPvGoBoardStateWithChains) {
  let pointsControlledBlack = 0;
  let pointsControlledWhite = 0;
  let potentialEyesBlack = getAllPotentialEyes(ns, BLACK, boardState);
  // count and assign both player controlled spaces (points adjacent to eyes)
  for (const eye of potentialEyesBlack) {
    for (const point of eye.chainPoints) {
      pointsControlledBlack++;
      boardState.points[point.x][point.y].controller = BLACK;
    }
  }
  let potentialEyesWhite = getAllPotentialEyes(ns, WHITE, boardState);

  for (const eye of potentialEyesWhite) {
    for (const point of eye.chainPoints) {
      boardState.points[point.x][point.y].controller = WHITE;
      pointsControlledWhite++
    }
  }
  // then also add the number of controller points itself to the overal counters
  pointsControlledBlack += boardState.points.flat().filter((p) => p.state === BLACK).length;
  pointsControlledWhite += boardState.points.flat().filter((p) => p.state === WHITE).length;

  return { pointsControlledBlack, pointsControlledWhite }
}

export function getAllEyesByChainId(ns: NS, board: IPvGoBoardStateWithChains, player: Color) {

  const eyeCandidates = getAllPotentialEyes(ns, player, board);
  // indexed by chain id, it will show all eyes which are adjacent to it, note that an eye is also a chain so can consist of multiple points
  // hence each chain id contains a list of eyes (which is a list of points)
  const eyesByChainID: EyesByChainIDType = new Map();

  eyeCandidates.forEach((candidate) => {
    // this shouldnt happen
    if (candidate.neighboringChains.length === 0) {
      return;
    }

    // If only one chain surrounds the empty space, it is a true eye
    // Since the set contains only empty chains, hence the surrounding chain must be of the player
    if (candidate.neighboringChains.length === 1) {
      if (eyesByChainID.has(candidate.neighboringChains[0].chain)) {
        eyesByChainID.get(candidate.neighboringChains[0].chain)!.push([...candidate.chainPoints]);
      }
      else {
        eyesByChainID.set(candidate.neighboringChains[0].chain, [[...candidate.chainPoints]])
      }
      return;
    }

    // If any chain fully encircles the empty space (even if there are other chains encircled as well), the eye is true
    const neighborsEncirclingEye = findNeighboringChainsThatFullyEncircleEmptySpace(
      ns,
      board,
      candidate,
    );

    // multiple chains can fully encircle the eye, hence for each chain then this eye is added
    neighborsEncirclingEye.forEach((neighborChain) => {
      const neighborChainID = neighborChain.chain;
      if (eyesByChainID.has(neighborChainID)) {
        eyesByChainID.get(neighborChainID)!.push([...neighborChain.chainPoints]);
      }
      else {
        eyesByChainID.set(neighborChainID, [[...neighborChain.chainPoints]])
      }
    });
  });

  return eyesByChainID;
}

/**
  Find all empty spaces completely surrounded by the input single player color (or empty)
  Returns that set of chains and the color ( which is input color or empty)
 */
export function getAllPotentialEyes(ns: NS, color: Color, boardStateInput: IPvGoBoardStateWithChains) {

  const nodeCount = boardStateInput.points.flat().filter((p) => p.state === WHITE || p.state === BLACK).length;
  let maxSize = Math.min(nodeCount * 0.4, 11); // exclude some edge cases, i.e. only one node is placed, this is same restriction as in AI code.
  // create set to store all empty chains, this will be the basis for potential eyes
  let emptyChains = new Set<number>();
  // create set to store all empty chains, this will be the basis for potential eyes
  for (const [key, value] of boardStateInput.chainMap) {
    if (value.points.length <= maxSize && value.state === EMPTY) {
      emptyChains.add(key);
    }
  }


  // get all chains which are empty, their points, and the neighboringChains
  const eyeCandidates: { chain: number, chainPoints: Point[], neighboringChains: { chain: number, color: IPvGONodeState, chainPoints: Point[] }[] }[] = [];
  let x = [...emptyChains];

  x.forEach((chain) => {
    const neighboringChains = getAdjacenPlayerChains(ns, chain, boardStateInput);

    const hasWhitePieceNeighbor = neighboringChains.find(
      (neighborChain) => neighborChain.color === WHITE,
    );
    const hasBlackPieceNeighbor = neighboringChains.find(
      (neighborChain) => neighborChain.color === BLACK,
    );

    // if the chain does not yet have an opposing players chain adjacent, then it is a potential eye
    if (
      (color === WHITE && hasWhitePieceNeighbor && !hasBlackPieceNeighbor) ||
      (color === BLACK && !hasWhitePieceNeighbor && hasBlackPieceNeighbor)
    ) {
      eyeCandidates.push({
        neighboringChains: neighboringChains.map((n) => { return { chain: n.chain, color: n.color, chainPoints: [...n.pointsOfChain] } }),
        chain: chain,
        chainPoints: boardStateInput.chainMap.get(chain)?.points ?? []
      });
    }
  });

  return eyeCandidates;
}


/**
 *
 * // returns all adjacent player chains (adjacent / touching), player = white
 */
export function getAdjacenPlayerChains(ns: NS, chainNumber: number, boardStateLocal: IPvGoBoardStateWithChains) {
  let pointsOfChain = boardStateLocal.chainMap.get(chainNumber);
  if (pointsOfChain === undefined) {
    return []
  }

  // get all player neighboring points;
  const playerNeighborPoints = playerNeighbors(ns, boardStateLocal, pointsOfChain.points);

  let neighboringChains = new Set<number>();
  for (const playerNeighbor of playerNeighborPoints) {
    let chain = boardStateLocal.chains[playerNeighbor.x][playerNeighbor.y];
    if (chain === null) {
      continue;
    }
    neighboringChains.add(chain)
  }
  // return the chain with the corresponding color
  return [...neighboringChains].map((c) => {
    let chainMapEntry = (boardStateLocal.chainMap.get(c) as {
      points: Point[];
      state: IPvGONodeState;
    });

    return {
      chain: c, color: chainMapEntry.state, pointsOfChain: [...chainMapEntry.points]
    }
  });
}

// Returns all neighboring player points to the input points
export function playerNeighbors(ns: NS, board: IPvGoBoardStateWithChains, points: Point[]) {
  let neighbors = new Set<string>();

  for (const point of points) {
    let neighborsOfPoint = getAdjacentPoints(ns, point);
    for (const neighborOfPoint of neighborsOfPoint) {
      if (board.points[neighborOfPoint.x][neighborOfPoint.y].state === WHITE || board.points[neighborOfPoint.x][neighborOfPoint.y].state === BLACK)
        // add all neighbors, this might also include points in the input points set
        neighbors.add(JSON.stringify(neighborOfPoint));
    }
  }

  let neighborsAsArray = Array.from(neighbors.values().map(s => (JSON.parse(s) as Point)));
  // filter out points which are in the input set
  neighborsAsArray = neighborsAsArray.filter((n) => points.every((input) => JSON.stringify(input) !== JSON.stringify(n)));
  return neighborsAsArray;
}


/**
 *  For each chain bordering an eye candidate:
 *    remove all other neighboring chains. (replace with empty points)
 *    check if the eye candidate is a simple true eye now
 *       If so, the original candidate is a true eye.
 */
function findNeighboringChainsThatFullyEncircleEmptySpace(
  ns: NS,
  boardInput: IPvGoBoardStateWithChains,
  eyeCandidate: {
    chain: number;
    chainPoints: Point[];
    neighboringChains: {
      chain: number;
      color: IPvGONodeState;
      chainPoints: Point[];
    }[];
  },
) {

  const candidateSpread = findFurthestPointsOfChain(eyeCandidate.chainPoints);
  return eyeCandidate.neighboringChains.filter((neighborChain, index) => {
    // If the chain does not go far enough to surround the eye in question, don't bother building an eval board
    let chainFromMap = boardInput.chainMap.get(neighborChain.chain);
    if (chainFromMap === undefined) {
      return;
    }
    const neighborSpread = findFurthestPointsOfChain(chainFromMap.points);
    const boardMax = boardInput.points[0].length;
    const couldWrapNorth =
      neighborSpread.north > candidateSpread.north ||
      (candidateSpread.north === boardMax && neighborSpread.north === boardMax);
    const couldWrapEast =
      neighborSpread.east > candidateSpread.east ||
      (candidateSpread.east === boardMax && neighborSpread.east === boardMax);
    const couldWrapSouth =
      neighborSpread.south < candidateSpread.south || (candidateSpread.south === 0 && neighborSpread.south === 0);
    const couldWrapWest =
      neighborSpread.west < candidateSpread.west || (candidateSpread.west === 0 && neighborSpread.west === 0);

    if (!couldWrapNorth || !couldWrapEast || !couldWrapSouth || !couldWrapWest) {
      return false;
    }

    const simpleCopy = getSimpleCopy(ns, boardInput);
    // remove all other chains from evaluation board (make their points empty)
    for (let otherNeighbor of eyeCandidate.neighboringChains) {
      if (otherNeighbor.chain === neighborChain.chain) {
        continue;
      }
      let chainMapEntry = boardInput.chainMap.get(otherNeighbor.chain);
      if (chainMapEntry === undefined) {
        continue
      }
      for (const pointToRemove of chainMapEntry.points) {
        simpleCopy[pointToRemove.x][pointToRemove.y] = EMPTY;
      }
    }
    const evaluationBoard = createIPvGOBoardStateWithChains(ns, simpleCopy);


    // get a point of current chain,
    const examplePoint = chainFromMap.points[0];
    // get new chains

    const newChainID = evaluationBoard.chains[examplePoint.x]?.[examplePoint.y];
    // shouldnt happen, point is still a color hence should still exist
    if (newChainID === null) {
      return false;
    }

    const newNeighborChains = getAdjacenPlayerChains(ns, newChainID, evaluationBoard);

    return newNeighborChains.length === 1;
  });
}

/**
 * Determine the furthest that a chain extends in each of the cardinal directions
 */
function findFurthestPointsOfChain(chain: Point[]) {
  return chain.reduce(
    (directions, point) => {
      if (point.y > directions.north) {
        directions.north = point.y;
      }
      if (point.y < directions.south) {
        directions.south = point.y;
      }
      if (point.x > directions.east) {
        directions.east = point.x;
      }
      if (point.x < directions.west) {
        directions.west = point.x;
      }

      return directions;
    },
    {
      north: chain[0].y,
      east: chain[0].x,
      south: chain[0].y,
      west: chain[0].x,
    },
  );
}

/**
 * @return the amount of points which are contested (controller = ?)
 */
export function numberContestedPoints(ns: NS, boardStateInput: IPvGOBoardState) {
  let contestedPoints = boardStateInput.points.flat().reduce((contestedPoints, p) => contestedPoints + +(p.controller === '?'), 0);
  return contestedPoints;
}
/**
 * @return the total amount of points on the board (excluding broken points)
 */
export function numberTotalPlayablePoints(ns: NS, boardStateInput: IPvGOBoardState) {
  let totalPlayablePoints = boardStateInput.points[0].length * boardStateInput.points[0].length - boardStateInput.points.flat().reduce((points, p) => points + +(p.state !== DEAD), 0);
  return totalPlayablePoints;
}

/**
 * returns all empty points of the board
 */
export function getEmptyPoints(ns: NS, boardStateInput?: IPvGoBoardStateWithChains): Point[] {
  let board = boardStateInput ?? boardStateGlobal;
  let points = [] as Point[];
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      if (board.points[x][y].state === EMPTY) {
        points.push({ x, y });
      }
    }
  }
  return points;
}


export function toStringRepresentation(ns: NS, boardStateInput: {
  points: { state: IPvGONodeState }[][]
}) {
  return boardStateInput.points.map(
    (row) => row.map(point => point.state).join('')
  );
}

// for easier UI display, convert point to GO coordinated
export function pointToCoordinates(ns: NS, point: Point) {
  // converts 0,0 -> A1 , 12,12 -> N,13
  // there is no I!
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
  let letter = letters[point.x];
  let number = point.y + 1;
  return `${letter},${number}`
}

export async function updateHUD(ns: NS) {
  globals = JSON.parse(ns.read(fileGlobals))
  if (!!globals.HUDPort) {
    let dataToWrite = { sequence: 4, rows: [] as HUDRow[] }
    const defaultMove = { point: { x: -1, y: -1 }, type: "RANDOM" };
    let lastPlayerMove: Move | CheatMove = data.moves[data.moves.length - 1] ?? defaultMove;
    let LastOpponentMove: Point = data.movesOpponent[data.movesOpponent.length - 1] ?? { x: -1, y: -1 };
    let showFactionToPlay = hardcodedFactionToPlay !== undefined ? `Hardcoded ${hardcodedFactionToPlay}` : `${data.opponent}`
    dataToWrite.rows.push({ header: 'Opponent', value: `${showFactionToPlay}` });
    dataToWrite.rows.push({ header: 'LastPlayerMove', value: valueForMove(ns, lastPlayerMove) });
    if (true) {
      let lastPlayerMove1: Move | CheatMove = data.moves[data.moves.length - 2] ?? defaultMove;
      dataToWrite.rows.push({ header: 'LastPlayerMove', value: valueForMove(ns, lastPlayerMove1) });
      let lastPlayerMove2: Move | CheatMove = data.moves[data.moves.length - 3] ?? defaultMove;
      dataToWrite.rows.push({ header: 'LastPlayerMove', value: valueForMove(ns, lastPlayerMove2) });
      let lastPlayerMove3: Move | CheatMove = data.moves[data.moves.length - 4] ?? defaultMove;
      dataToWrite.rows.push({ header: 'LastPlayerMove', value: valueForMove(ns, lastPlayerMove3) });
      let lastPlayerMove4: Move | CheatMove = data.moves[data.moves.length - 5] ?? defaultMove;
      dataToWrite.rows.push({ header: 'LastPlayerMove', value: valueForMove(ns, lastPlayerMove4) });

      let chains = ns.go.analysis.getChains();
      let chainsAnalysis = [...new Set(chains.flat(1))];
      let chainsOwn = [...new Set(boardStateGlobal.chains.flat(1))];
      if (chainsAnalysis.length !== chainsOwn.length) {
        ns.tprint(chainsAnalysis)
        ns.tprint(chainsOwn)
        ns.tprint(chains)
        ns.tprint(boardStateGlobal.chains)
        await ns.sleep(1000000);
      }
      dataToWrite.rows.push({ header: 'analysis Chains', value: String(chainsAnalysis.length) });
      dataToWrite.rows.push({ header: 'own Chains', value: String(chainsOwn.length) });
    }
    dataToWrite.rows.push({ header: 'LastOpponent', value: `${pointToCoordinates(ns, LastOpponentMove)}` });
    dataToWrite.rows.push({ header: 'BlackScore', value: `${boardStateGlobal.pointsControlledBlack}` });
    dataToWrite.rows.push({ header: 'WhiteScore', value: `${boardStateGlobal.pointsControlledWhite}` });
    ns.writePort(globals.HUDPort, dataToWrite)
  }
}

export function valueForMove(ns: NS, move: Move | CheatMove) {
  if (move.type === 'PlayTwoMoves') {
    return `${pointToCoordinates(ns, move.point)} ${pointToCoordinates(ns, move.point2)} ${move.type}`;
  }
  else {
    return `${pointToCoordinates(ns, move.point)} ${move.type}`;
  }
}