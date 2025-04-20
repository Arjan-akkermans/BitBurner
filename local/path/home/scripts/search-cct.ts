import { getAllServers } from './utils'


export async function main(ns: NS) {

  // Search for cct files
  // if type is implmemented solve it (and give output based on result)
  // if unknown type log to terminal

  getAllServers(ns).forEach((server: string) => {
    const files = ns.ls(server);
    let solved = false;
    files.forEach((file) => {
      if (file.endsWith('.cct')) {
        const contractType = ns.codingcontract.getContractType(file, server);
        const data = ns.codingcontract.getData(file, server);

        let answer = undefined as any;
        switch (contractType) {
          case ns.enums.CodingContractName.FindLargestPrimeFactor:
            answer = findLargestPrimeFactor(ns, data);
            break;
          case ns.enums.CodingContractName.EncryptionICaesarCipher:
            answer = encryptionICaesarCipher(ns, data);
            break;
          case ns.enums.CodingContractName.EncryptionIIVigenereCipher:
            answer = encryptionIIVigenereCipher(ns, data[0], data[1]);
            break;
          case ns.enums.CodingContractName.SquareRoot:
            answer = squareRoot(ns, data);
            break;
          case ns.enums.CodingContractName.CompressionIRLECompression:
            answer = rleCompression(ns, data);
            break;
          case ns.enums.CodingContractName.UniquePathsInAGridI:
            answer = uniquePathsInAGridI(ns, data[0], data[1]);
            break;
          case ns.enums.CodingContractName.SubarrayWithMaximumSum:
            answer = subarrayWithMaximumSum(ns, data);
            break;
          case ns.enums.CodingContractName.ArrayJumpingGame:
            answer = arrayJumpingGame(ns, data);
            break;
          case ns.enums.CodingContractName.ArrayJumpingGameII:
            answer = arrayJumpingGameII(ns, data);
            break;
          case ns.enums.CodingContractName.CompressionIILZDecompression:
            answer = lzDecompression(ns, data);
            break;
          case ns.enums.CodingContractName.HammingCodesIntegerToEncodedBinary:
            answer = integerToEncodedBinary(ns, data);
            break;
          case ns.enums.CodingContractName.HammingCodesEncodedBinaryToInteger:
            answer = encodedBinaryToInteger(ns, data);
            break;
          case ns.enums.CodingContractName.MinimumPathSumInATriangle:
            answer = minimumPathSumInATriangle(ns, data);
            break;
          case ns.enums.CodingContractName.TotalWaysToSumII:
            answer = totalWaysToSumII(ns, data);
            break;
          case ns.enums.CodingContractName.MergeOverlappingIntervals:
            answer = mergeOverlappingIntervals(ns, data);
            break;
          case ns.enums.CodingContractName.GenerateIPAddresses:
            answer = generateIPAddress(ns, data);
            break;
          case ns.enums.CodingContractName.SpiralizeMatrix:
            answer = spiralizeMatrix(ns, data);
            break;
          case ns.enums.CodingContractName.TotalWaysToSum:
            answer = totalWaysToSum(ns, data);
            break;
          case ns.enums.CodingContractName.AlgorithmicStockTraderI:
            answer = algorithmicStockTraderI(ns, data);
            break;
          case ns.enums.CodingContractName.AlgorithmicStockTraderII:
            answer = algorithmicStockTraderII(ns, data);
            break;
          case ns.enums.CodingContractName.AlgorithmicStockTraderIII:
            answer = algorithmicStockTraderIII(ns, data);
            break;
          case ns.enums.CodingContractName.AlgorithmicStockTraderIV:
            answer = algorithmicStockTraderIV(ns, data);
            break;
          case ns.enums.CodingContractName.SanitizeParenthesesInExpression:
            answer = sanitizeParenthesesInExpression(ns, data);
            break;
          case ns.enums.CodingContractName.FindAllValidMathExpressions:
            answer = findAllValidMathExpressions(ns, data);
            break;
          case ns.enums.CodingContractName.Proper2ColoringOfAGraph:
            answer = proper2ColeringOfAGraph(ns, data);
            break;
          case ns.enums.CodingContractName.ShortestPathInAGrid:
            answer = shortestPathInAGrid(ns, data);
          default:
            ns.tprint('unknown CCT type ', contractType, ' for contract ', file, ' on ', server);
        }
        if (!!answer) {
          const result = ns.codingcontract.attempt(answer, file, server);
          if (result) {
            ns.tprint("solved contract ", file, ' of type ', contractType, ' on ', server, ' . ', result);
          }
          else {
            ns.tprint("Failed to solve contract ", file, ' of type', contractType, ' on ', server, ' the wrong answer was ', answer);
          }
        }
      }
    })
  })

}


// Functions
const findLargestPrimeFactor = (ns: NS, n: number) => {

  const primeFactors = [] as number[];
  while (n % 2 === 0) {
    primeFactors.push(2);
    n = Math.floor(n / 2);
  }


  for (let i = 3; i <= Math.floor(Math.sqrt(n));
    i = i + 2) {

    while (n % i === 0) {

      primeFactors.push(i)
      n = Math.floor(n / i);
    }
  }

  if (n > 2) {
    primeFactors.push(n);
  }
  return Math.max(...primeFactors);
}

const alphabet = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

export function encryptionICaesarCipher(ns: NS, data: (string | number)[]) {
  const plaintext = (data[0] as string).split('');
  const keyword = data[1] as number;

  let output = '';
  for (let i = 0; i < plaintext.length; i++) {
    const plainChar = plaintext[i];

    const plainCharIndexInAlphabet = alphabet.findIndex((letter) => letter === plainChar);
    // if char is not in alphabet then just add it to output
    if (plainCharIndexInAlphabet === -1) {
      output = output.concat(plainChar);
    }
    else {
      let indexToUse = plainCharIndexInAlphabet - keyword;
      if (indexToUse < 0) {
        indexToUse += 26;
      }
      output = output.concat(alphabet[(indexToUse)])
    }
  }

  return output;
}

export function encryptionIIVigenereCipher(ns: NS, plaintext: string, keyword: string) {

  const keywordLength = keyword.length
  for (let i = keywordLength; i < plaintext.length; i++) {
    keyword = keyword.concat(keyword[i % keywordLength]);
  }

  let output = '';

  for (let i = 0; i < plaintext.length; i++) {
    const plainChar = plaintext[i];
    const keyChar = keyword[i];

    const plainCharIndexInAlphabet = alphabet.findIndex((letter) => letter === plainChar);
    const keyCharCharIndexInAlphabet = alphabet.findIndex((letter) => letter === keyChar);

    output = output.concat(alphabet[(plainCharIndexInAlphabet + keyCharCharIndexInAlphabet) % 26])
  }

  return output;
}

const squareRoot = (ns: NS, input: bigint) => {

  // https://en.wikipedia.org/wiki/Integer_square_root binary search
  // Keeps shortening interval [l,r]
  // starting with [0,input]

  let count = 0;
  let l = BigInt(0);
  let m = BigInt(0);
  let r = input + BigInt(1);
  while ((l != r - BigInt(1)) && count < 100000) {
    count++;
    m = (l + r) / BigInt(2);
    if ((m * m) <= input) {
      l = m;
    }
    else {
      r = m;
    }
  }

  // return value for which square has lowest diff
  const answer =
    (input - l * l <= r * r - input)
      ? l : r
  // bigInt is not accepted as type, and casting to number might lose accuracy!
  return answer.toString();
}

const rleCompression = (ns: NS, data: string) => {
  let i = 0;
  let output = '';
  while (i < data.length) {
    // get a char and search ahead untill it changes or 9 consecutive characters are found
    const char = data[i];
    let foundEnd = false;
    let j = 1;
    while (j < 9 && !foundEnd) {
      if (data[i + j] === char) {
        j++
      }
      else {
        foundEnd = true;
      }
    }
    i += j;
    output = output.concat(j + char);
  }
  return output;
}

const uniquePathsInAGridI = (ns: NS, rows: number, cols: number) => {
  // We have to calculate m+n-2 C n-1 here
  // which will be (m+n-2)! / (n-1)! (m-1)!
  let numberOfPaths = 1;
  for (let i = rows; i < (cols + rows - 1); i++) {
    numberOfPaths *= i;
    numberOfPaths = numberOfPaths / (i - rows + 1);
  }

  return (numberOfPaths);
}

const subarrayWithMaximumSum = (ns: NS, array: number[]) => {

  let currentLargestSum = 0;
  // simple bruto force by double look
  for (let i = 0; i < array.length; i++) {
    for (let j = i; j < array.length; j++) {

      // compute sum
      let currentSum = 0;
      for (let k = i; k <= j; k++) {
        currentSum += array[k];
      }
      currentLargestSum = Math.max(currentSum, currentLargestSum);
    }
  }
  return currentLargestSum;
}


export function arrayJumpingGame(ns: NS, array: number[]) {

  if (array.length === 0) {
    return 0;
  }

  // array indicating positions that are reachable
  const reachable = [0];
  let currentPosition = 0;
  while (currentPosition < reachable.length && currentPosition < array.length && currentPosition < 100000) {
    // walk through the array, and at each position push all the values that can be reached (which are not yet included)
    for (let i = 1; i <= array[currentPosition]; i++) {
      if (reachable.every((position) => position !== currentPosition + i)) {
        reachable.push(currentPosition + i)
      }
    }
    currentPosition++;
  }
  return reachable.some((position) => position === array.length - 1) ? 1 : 0;
}

export function arrayJumpingGameII(ns: NS, array: number[]): number {

  let canReachEnd = true;

  function recursiveCheck(a: number[]): number {
    if (!arrayJumpingGame(ns, a)) {
      // if not possible return 0
      canReachEnd = false;
      return 0;
    }
    else {
      // get the earliest index from which the end can be reached
      let earliestIndexToReachEnd = undefined as undefined | number
      for (let i = 0; i < a.length - 1; i++) {
        if (i + a[i] >= a.length - 1) {
          earliestIndexToReachEnd = i;
          break;
        }
      }
      if (earliestIndexToReachEnd === undefined) {
        // shouldnt happen because of check above which states end is reachable!
        return 0;
      }
      else {
        a.splice(earliestIndexToReachEnd + 1);
        if (a.length === 1) {
          return 1;
        }
        else {
          return 1 + recursiveCheck(a);
        }
      }
    }
  }

  let answer = recursiveCheck(array);
  return canReachEnd ? answer : 0;
}


const lzDecompression = (ns: NS, input: string) => {

  let i = 0;
  let iteration = 0;
  let output = '';
  while (i < input.length && iteration < 10000) {
    iteration++; //prevent looping
    // type 1 chunk
    length = Number(input.charAt(i))
    output += input.substring(i + 1, i + 1 + length);
    i += (length + 1);

    // type 2 chunk
    length = Number(input.charAt(i))
    const backwards = Number(input.charAt(i + 1));
    const endOutput = output.length;
    for (let j = 0; j < length; j++) {
      // need to do 1 by 1 to correctly handle the case where we need characters from the string we are now appending
      // e.g.4miss433ppi should be mississipi, the '43' gets two is while at start there is only 1 available;
      output += output[endOutput - backwards + j]
    }
    // if length is 0 the chunk ends immidiately hence only increase i with 1
    i += length === 0 ? 1 : 2
  }

  return output;
}

const integerToEncodedBinary = (ns: NS, input: number) => {
  // parity checks is at 2^n
  // each bit sets total number of 1s in a set even
  // each parity bit alternatively considers 2^n bits, then skips 2^n bits
  // the first bit is then set lastly and counts all other bits
  const binaryString = input.toString(2);
  let output = binaryString.split(''); // Convert string to array for easier manipulation

  // Determine the number of parity bits needed
  let parityBitCount = 0;
  while (Math.pow(2, parityBitCount) < output.length + parityBitCount + 1) {
    parityBitCount++;
  }

  // Insert parity bits (set to '0' initially)
  for (let i = 0; i < parityBitCount; i++) {
    const parityBitPosition = Math.pow(2, i) - 1; // Parity bits are at positions 1, 2, 4, 8, ...
    output.splice(parityBitPosition, 0, '0');
  }


  // Set the parity bits
  for (let i = 0; i < parityBitCount; i++) {
    const parityBitPosition = Math.pow(2, i) - 1; // Parity bits are at positions 1, 2, 4, 8, ...
    let countOfOnes = 0;

    // Count 1's in positions covered by this parity bit
    for (let j = parityBitPosition; j < output.length; j++) {
      if (Math.floor((j + 1) / (parityBitPosition + 1)) % 2 === 1) {
        countOfOnes += Number(output[j]);
      }
    }

    // Set the parity bit to make the total number of 1's even
    output[parityBitPosition] = (countOfOnes % 2 === 0 ? '0' : '1');
  }

  // Set the overall parity bit (the first bit) to count all bits
  let totalOnes = 0;
  for (let i = 0; i < output.length; i++) {
    totalOnes += Number(output[i]);
  }
  output.splice(0, 0, (totalOnes % 2 === 0 ? '0' : '1'));
  return output.join('');
};

const encodedBinaryToInteger = (ns: NS, binaryString: string) => {

  // parity checks is at 2^n
  // each bit sets total number of 1s in a set even
  // each parity bit alternatively considers 2^n bits, then skips 2^n bits
  // the first bit is then set lastly and counts all other bits

  // get the index of the last parity bit
  let i = 1;
  let count = 0;
  while (Math.pow(2, i + 1) < binaryString.length && count < 10000) {
    count++;
    i++;
  }
  let parityBitLast = Math.pow(2, i);
  let parityBitToCheck = parityBitLast;
  // check if all parity bits (except for the 0 index) pass or not
  let failedParityChecks = [] as number[];
  count = 0;
  while (parityBitToCheck >= 1 && count < 10000) {
    count++;

    let numberOfOnesInSet = 0;
    // boolean to manage counting or not to alternate between sets
    let doCount = true;
    let numbersCounted = 0;
    let countLast = 1; // indicate till what is being counted
    for (let j = parityBitToCheck + 1; j < binaryString.length; j++) {
      numbersCounted++;
      if (doCount) {
        numberOfOnesInSet += Number(binaryString[j]);
      }
      if (numbersCounted === countLast) {
        doCount = !doCount;
        countLast *= 2;
        numbersCounted = 0;
      }
    }
    if (!(numberOfOnesInSet % 2 === Number(binaryString[parityBitToCheck]))) {
      failedParityChecks.push(parityBitToCheck)
    }
    parityBitToCheck /= 2;

  }
  // confirmation for the first bit is not done
  // if that shows something is off then at least 2 bits are flipped, hence challenge is not solvable for that case

  // correct encoded string if needed
  if (failedParityChecks.length > 0) {
    // Correcting the bits will go as following:
    // First find all correct bits by adding all indexis which are verified by a passed bit check
    // Also count for each failed sanity check which bits it verified
    // Assuming only 1 bit is wrong, that bit should be covered by all failed checks
    // Flip that bit
    let bitsVerified = new Set as Set<number>;
    let bitsCoveredByFaultyCheck = [] as number[][]
    let count = 0;
    i = 0;
    while (Math.pow(2, i) < binaryString.length && count < 10000) {
      count++;
      const faultyBitsCoveredByThis = [] as number[]
      const parityCheckBit = Math.pow(2, i);
      const isParityCheckOK = !(failedParityChecks.find((failedParityCheck) => failedParityCheck === parityCheckBit))
      // push numbers which are verified by the ith parity check
      // this is all numbers which are counted
      let doCount = true;
      let numbersCounted = 0;
      let countLast = 1; // indicate till what is being counted
      for (let j = parityCheckBit + 1; j < binaryString.length; j++) {
        numbersCounted++;
        if (doCount) {
          if (isParityCheckOK) {
            bitsVerified.add(j);
          }
          else {
            faultyBitsCoveredByThis.push(j);
          }
        }
        if (numbersCounted === countLast) {
          doCount = !doCount;
          countLast *= 2;
          numbersCounted = 0;
        }
      }
      i++;
      if (!isParityCheckOK) {
        bitsCoveredByFaultyCheck.push([...faultyBitsCoveredByThis])
      }
    }
    // loop over all numbers, and change the one not verified
    const faultyBits = bitsCoveredByFaultyCheck.reduce((acc, currArr, index) => {
      // On the first iteration, set acc to the current array
      if (index === 0) {
        return currArr;
      }
      // Filter acc to include only numbers that are in both acc and the current array
      return acc.filter(num => currArr.includes(num));
    });
    // if there are multiple faulty bits then a parity bit must have been changed hence no modification is needed
    if (faultyBits.length === 1) {
      const bitToCorrect = faultyBits[0];
      // a bit is only wrong if every fauly check covered it!
      binaryString = binaryString.slice(0, bitToCorrect) + (binaryString[bitToCorrect] === '0' ? '1' : '0') + binaryString.slice(bitToCorrect + 1);
    }
    else if (faultyBits.length === 0) {
      ns.tprint('did not found any faulty bits while the previous check expected there to be some')
    }
  }

  // remove parity bits from string
  count = 0;
  let parityBitToRemove = parityBitLast
  while (parityBitToRemove >= 1 && count < 10000) {
    count++;
    binaryString = binaryString.slice(0, parityBitToRemove) + binaryString.slice(parityBitToRemove + 1);
    parityBitToRemove /= 2;
  }
  // also remove first digit
  binaryString = binaryString.slice(1);

  // convert to decimal
  const output = parseInt(binaryString, 2);
  return output;
}

export function minimumPathSumInATriangle(ns: NS, data: number[][]): number {
  // base case, there is only 1 entry remaining, return that value
  if (data.length === 0) {
    return 0;
  }
  else if (data.length === 1) {
    // assumed length is 1 in this case
    return data[0][0];
  }
  else {
    // try either path and return the minimum of the paths
    const valueHere = data[0][0];

    // if go left cut of all first entries
    // if go right cut of all last entries
    // always cut of first row as we already counted it
    let dataModified = data.slice(1);
    let dataModifiedGoRight = [] as number[][];
    let dataModifiedGoLeft = [] as number[][];

    for (let i = 0; i < dataModified.length; i++) {
      let array = [];
      for (let j = 1; j < dataModified[i].length; j++) {
        array.push(dataModified[i][j]);
      }
      dataModifiedGoRight.push(array);
    }

    for (let i = 0; i < dataModified.length; i++) {
      let array = [];
      for (let j = 0; j < dataModified[i].length - 1; j++) {
        array.push(dataModified[i][j]);
      }
      dataModifiedGoLeft.push(array);
    }
    return valueHere + Math.min(minimumPathSumInATriangle(ns, dataModifiedGoLeft), minimumPathSumInATriangle(ns, dataModifiedGoRight))
  }
}

export function totalWaysToSumII(ns: NS, data: (number | number[])[]): number {

  const target = data[0] as number;
  let numbers = data[1] as number[];
  ns.tprint('solving waysToSumII, this might take awhile...')
  // this is the simplest implemenration from:
  // https://www.geeksforgeeks.org/coin-change-dp-7/?ref=lbp

  function countRecur(numbers: number[], n: number, target: number): number {

    // If sum is 0 then there is 1 solution
    // (do not include any numbers)
    if (target === 0) return 1;

    // 0 ways in the following two cases
    if (target < 0 || n === 0) return 0;

    // count is sum of solutions including numbers[n-1]
    // and excluding numbers[n-1]
    return countRecur(numbers, n, target - numbers[n - 1]) +
      countRecur(numbers, n - 1, target);
  }

  return countRecur(numbers, numbers.length, target);

}

export function totalWaysToSum(ns: NS, data: number) {


  let integers = [];
  for (let i = 1; i < data; i++) {
    integers.push(i);
  }

  let dataII = [data, integers];
  return totalWaysToSumII(ns, dataII);
}

export function mergeOverlappingIntervals(ns: NS, data: number[][]) {

  function isOverlapping(a: number[], b: number[]) {
    return (a[0] <= b[1] && b[0] <= a[1])
  }

  function mergeIntervals(a: number[], b: number[]) {
    return ([Math.min(a[0], b[0]), Math.max(a[1], b[1])])
  }

  let currentIntervals = data.sort((a, b) => a[0] - b[0]);
  let counter = 0;
  let j = 0;
  while (j !== currentIntervals.length) {
    counter++;
    for (j = 0; j < currentIntervals.length; j++) {
      for (let k = j + 1; k < currentIntervals.length; k++) {
        if (isOverlapping(currentIntervals[j], currentIntervals[k])) {
          let a = [...currentIntervals[j]];
          let b = [...currentIntervals[k]];
          currentIntervals.splice(j, 1);
          //splicing the j out alters the index of k!
          currentIntervals.splice(k - 1, 1, [...mergeIntervals(a, b)]);
          j = currentIntervals.length + 1;
          k = currentIntervals.length;

        }
      }
    }
  }
  return currentIntervals.sort((a, b) => a[0] - b[0]);
}

export function generateIPAddress(ns: NS, data: number) {

  // ip address is 4 numbers between 0 and 255
  function isValid(ip: string) {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    for (const part of parts) {
      const num = parseInt(part);
      if (num < 0 || num > 255 || part.length !== String(num).length) return false;
    }
    return true;
  }
  let dataString = data.toString();
  if (dataString.length < 4 || dataString.length > 12) {
    return []
  }

  // generate all possible combinations of 4 numbers

  const combinations = [] as string[];
  for (let i = 1; i < dataString.length - 2; i++) {
    for (let j = i + 1; j < dataString.length - 1; j++) {
      for (let k = j + 1; k < dataString.length; k++) {
        const part1 = dataString.slice(0, i);
        const part2 = dataString.slice(i, j);
        const part3 = dataString.slice(j, k);
        const part4 = dataString.slice(k);
        const ip = `${part1}.${part2}.${part3}.${part4}`;
        if (isValid(ip)) {
          combinations.push(ip);
        }
      }
    }
  }
  return combinations;
}


export function spiralizeMatrix(ns: NS, data: number[][]) {
  let visited = data.map((row) => row.slice().fill(0));

  function canMoveInDirection(direction: string) {
    switch (direction) {
      case 'right':
        return (j + 1 < data[i].length && visited[i][j + 1] === 0)
      case 'down':
        return (i + 1 < data.length && visited[i + 1][j] === 0)
      case 'left':
        return (j - 1 >= 0 && visited[i][j - 1] === 0)
      case 'up':
        return (i - 1 >= 0 && visited[i - 1][j] === 0)
      default:
        return false;
    }
  }
  let direction = 'right';
  let answer = [] as number[];
  let i = 0;
  let j = 0;
  let counter = 0;
  const safeguard = data.length * data[0].length;
  while (counter <= safeguard) {
    counter++;
    visited[i][j] = 1;
    answer.push(data[i][j]);
    // check if we can move in the current direction
    let canMove = canMoveInDirection(direction);
    if (!canMove) {
      switch (direction) {
        case 'right':
          direction = 'down';
          canMove = canMoveInDirection(direction);
          break;
        case 'down':
          direction = 'left';
          canMove = canMoveInDirection(direction);
          break;
        case 'left':
          direction = 'up';
          canMove = canMoveInDirection(direction);
          break;
        case 'up':
          direction = 'right';
          canMove = canMoveInDirection(direction);
          break;
        default:
          break;
      }
    }
    if (canMove) {
      // update indices
      switch (direction) {
        case 'right':
          j++;
          break;
        case 'down':
          i++;
          break;
        case 'left':
          j--;
          break;
        case 'up':
          i--;
          break;
      }
    }
    else {
      break;
    }
  }
  return answer;
}

export function algorithmicStockTraderI(ns: NS, data: number[]) {
  let maxProfit = 0;
  // loop over all pairs and check profit
  for (let i = 0; i < data.length; i++) {
    for (let j = i + 1; j < data.length; j++) {
      if (data[j] - data[i] > maxProfit) {
        maxProfit = data[j] - data[i];
      }
    }
  }
  return maxProfit;
}

type StockAction = 'buy' | 'sell' | 'none';

function calculateProfit(data: number[], actions: StockAction[]) {
  let profit = 0;
  for (let i = 0; i < data.length; i++) {
    if (actions[i] === 'buy') {
      profit -= data[i];
    }
    else if (actions[i] === 'sell') {
      profit += data[i];
    }
  }
  return profit;
}


export function algorithmicStockTraderII(ns: NS, data: number[]) {

  // buy and sell can be done as many times as posible
  // a simple heurisitc is the optimal solution
  const actions = [] as StockAction[];
  let hasStock = false;
  for (let i = 0; i < data.length; i++) {
    if (i < data.length - 1) {
      if (!hasStock) {
        if (data[i + 1] > data[i]) {
          actions.push('buy');
          hasStock = true;
        }
        else {
          actions.push('none');
        }
      }
      else {
        if (data[i + 1] < data[i]) {
          actions.push('sell');
          hasStock = false;
        }
        else {
          actions.push('none');
        }
      }

    }
    else {
      if (hasStock) {
        actions.push('sell')
      }
      else {
        actions.push('none')
      }
    }
  }

  return calculateProfit(data, actions);
}

function algorithmicStockTraderIII(ns: NS, data: number[]) {
  // buy and sell a maximum of 2 times
  // as there are not too many combinations possible we can simply try all of them

  let maxProfitOneTransaction = 0;
  // loop over all pairs and check profit
  for (let i = 0; i < data.length; i++) {
    for (let j = i + 1; j < data.length; j++) {
      if (data[j] - data[i] > maxProfitOneTransaction) {
        maxProfitOneTransaction = data[j] - data[i];
      }
    }
  }

  // try all combinations of buy - sell - buy - sell
  let maxProfitTwoTransaction = 0;
  for (let i = 0; i < data.length; i++) {
    for (let j = i + 1; j < data.length; j++) {
      for (let k = j + 1; k < data.length; k++) {
        for (let l = k + 1; l < data.length; l++) {
          const profit = (data[j] - data[i]) + (data[l] - data[k]);
          if (profit > maxProfitTwoTransaction) {
            maxProfitTwoTransaction = profit;
          }
        }
      }
    }
  }
  return Math.max(maxProfitOneTransaction, maxProfitTwoTransaction);
}

function algorithmicStockTraderIV(ns: NS, data: (number | number[])[]) {

  // buy and sell a maximum of n times
  // as there are not too many combinations possible we can simply try all of them
  const memo = new Map<string, number>();

  function maxProfit(n: number, data: number[]): number {
    const memoKey = `${n}-${data.length}`;
    if (memo.has(memoKey)) {
      return memo.get(memoKey)!;
    }
    // base case: if n=1 then its the maximum profit possible of one transaction
    if (n === 1) {
      let maxProfitOneTransaction = 0;
      // loop over all pairs and check profit
      for (let i = 0; i < data.length; i++) {
        for (let j = i + 1; j < data.length; j++) {
          if (data[j] - data[i] > maxProfitOneTransaction) {
            maxProfitOneTransaction = data[j] - data[i];
          }
        }
      }
      memo.set(memoKey, maxProfitOneTransaction);
      return maxProfitOneTransaction
    }
    else {
      let maxProfitFound = 0
      for (let i = 0; i < data.length; i++) {
        for (let j = i + 1; j < data.length; j++) {
          // buy at i and sell at j
          // now we can do n-1 transactions on the remaining data
          const profit = (data[j] - data[i]) + maxProfit(n - 1, data.slice(j + 1));
          if (profit > maxProfitFound) {
            maxProfitFound = profit;
          }
        }
      }

      memo.set(memoKey, maxProfitFound);
      return maxProfitFound
    }
  }

  return maxProfit(data[0] as number, data[1] as number[]);
}


export function sanitizeParenthesesInExpression(ns: NS, data: string) {

  /*
  * Function is not fully correct as it does not generically generate all solutions, but it covers most cases...
  */


  // create array of chars for easier m

  let dataAsArray = data.split('');

  function stackCount(dataToSanatize: string[]) {
    let stack = 0;
    for (let i = 0; i < dataToSanatize.length; i++) {
      if (dataToSanatize[i] === '(') {
        stack++;
      }
      else if (dataToSanatize[i] === ')') {
        stack--;
      }
    }
    return stack;
  }

  function getSanatizedString(dataToSanatize: string[]) {
    let stack = 0;
    for (let i = 0; i < dataToSanatize.length; i++) {
      if (dataToSanatize[i] === '(') {
        stack++;
      }
      else if (dataToSanatize[i] === ')') {
        stack--;
        if (stack < 0) {
          dataToSanatize[i] = '';
          stack = 0;
        }
      }
    }

    while (stack > 0) {
      // remove the last '('
      for (let i = dataToSanatize.length - 1; i >= 0; i--) {
        if (dataToSanatize[i] === '(') {
          dataToSanatize[i] = '';
          stack--;
          break;
        }
      }
    }
    return dataToSanatize.join('');
  }
  let stack = stackCount(dataAsArray);
  if (stack === 0) {
    return [getSanatizedString(dataAsArray)]
  }
  else if (stack > 0) {
    let answersAsSet = new Set<string>;
    answersAsSet.add(getSanatizedString(dataAsArray));
    if (stack === 1) {
      // try all combinations when removing 1 '(' this should give some more successes, but not all...
      for (let i = 0; i < dataAsArray.length; i++) {
        if (dataAsArray[i] === '(') {
          let copiedArray = [...dataAsArray];
          copiedArray.splice(i, 1);
          let result = getSanatizedString(copiedArray);
          if (stackCount(result.split('')) === 0) {
            answersAsSet.add(result);
          }
        }
      }
    }
    return [...answersAsSet]
  }
  else {
    let answersAsSet = new Set<string>;
    answersAsSet.add(getSanatizedString(dataAsArray));
    if (stack === -1) {
      // try all combinations when removing 1 ')' this should give some more successes, but not all...
      for (let i = 0; i < dataAsArray.length; i++) {
        if (dataAsArray[i] === ')') {
          let copiedArray = [...dataAsArray];
          copiedArray.splice(i, 1);
          let result = getSanatizedString(copiedArray);
          if (stackCount(result.split('')) === 0) {
            answersAsSet.add(result);
          }
        }
      }
    }
    return [...answersAsSet]
  }
}



export function findAllValidMathExpressions(ns: NS, data: (string | number)[]) {
  let target = data[1] as number;
  let dataAsArray = (data[0] as string).split('');
  ns.tprint('finding all valid math expressions, this might take a while...');
  // return result of expression if valid
  function evaluateExpression(s: string) {
    function isValid(ss: string) {
      let s = ss.split('')
      // first char cannot be an operator (technically it can but solution doesnt accept it)
      if (s[0] === '*' || s[0] === '+' || s[0] === '-') { ; return false }
      if (s[s.length - 1] === '+' || s[s.length - 1] === '-' || s[s.length - 1] === '*') { return false }

      let preceeding = s[0]

      for (let i = 1; i < s.length; i++) {
        if (s[i] === '+' || s[i] === '*' || s[i] === '-') {
          if (preceeding === '+' || preceeding === '-' || preceeding === '*') {
            return false;
          }
        }
        else // number
        {
          // numbers with leading 0 are not considered valid
          if (preceeding === '0') {
            return false;
          }
        }
        preceeding = s[i];
      }
      return true;
    }
    // check if valid

    let answer = undefined as undefined | number;
    if (!isValid(s)) {
      return undefined;
    }
    eval('answer = ' + s);
    return (answer);
  }
  const results = new Set<string>();

  let currentOperators = [] as string[];
  for (let i = 0; i < dataAsArray.length; i++) {
    currentOperators.push('');
  }
  let allGenerated = false;
  let counter = 0;
  const threshold = Math.pow(4, currentOperators.length)
  // iterate over all permutations
  while (allGenerated === false && counter < threshold) {
    counter++;
    const currentExpression = (dataAsArray.map((a, i) => currentOperators[i] + a)).join('');
    let result = evaluateExpression(currentExpression);

    if (result === target) {
      results.add(
        currentExpression)
    }
    // increment the operators
    //  const operators = ['','+', '-', '*'];

    for (let i = 0; i < currentOperators.length; i++) {
      if (currentOperators[i] === '') {
        currentOperators[i] = '+';
        break;
      }
      else if (currentOperators[i] === '+') {
        currentOperators[i] = '-';
        break;
      }
      else if (currentOperators[i] === '-') {
        currentOperators[i] = '*';
        break;
      }
      else {
        currentOperators[i] = '';
        if (i === currentOperators.length - 1) {
          allGenerated = true;
        }
      }
    }
  }

  return [...results];
}

export function proper2ColeringOfAGraph(ns: NS, data: (number | number[][])[]) {
  let vertices = data[0] as number;
  let edges = data[1] as number[][];
  // for each vertix make a list of the other vertices that can be reached
  let v: Set<number>[] = Array.from({ length: vertices }, () => new Set<number>);
  // initialze empty array for each node
  for (const edge of edges) {

    let a = edge[0];
    let b = edge[1];
    v[a].add(b);
    v[b].add(a);
  }
  let answer = Array.from({ length: vertices }, () => 0);
  let unvisited = new Set<number>;
  for (let i = 0; i < vertices; i++) {
    unvisited.add(i);
  }
  let visited = new Set<number>;
  let toVisit = new Set<number>;
  toVisit.add(0);
  // greedily color the graph, simply take a random node and update the coloring of adjacent nodes.
  while (visited.size < vertices) {
    // take a random unvisited node
    // visit the node, i.e. remove from unvisited and add to visited
    // nodes added to unvisited are already correctly colored (the first on is colored by default as everything gets assigned the same starting color)
    let currentNode = 0;
    if (toVisit.size > 0) {
      currentNode = toVisit.values().next().value;
      toVisit.delete(currentNode);
    }
    else {
      currentNode = unvisited.values().next().value;
      unvisited.delete(currentNode);
    }

    visited.add(currentNode);

    let colorOtherEdges = answer[currentNode] === 0 ? 1 : 0;
    // add each adjacent edge to the unvisited set, and color them different from currentNode
    // note that because of the totalSum check above, this is guaranteed to give a proper 2 coloring
    for (let e of v[currentNode]) {
      answer[e] = colorOtherEdges;
      if (!visited.has(e)) {
        toVisit.add(e);
      }
      else {
        visited.add(e);
      }

    }
  }

  // check if coloring is ok;
  let isProperColor = v.every((vertex, i) => [...vertex].every((adjacent) =>
    answer[i] !== answer[adjacent]
  )
  )

  if (!isProperColor) {
    answer = [];
  }
  return answer;
}


export function shortestPathInAGrid(ns: NS, data: number[][]) {
  // store shortest path to each point
  // keep considering new nodes with currently the shortes path

  const rows = data.length;
  const cols = data[0].length;
  const initialMaxPath = 'X'
  let shortestPaths = []
  for (let i = 0; i < rows; i++) {
    shortestPaths[i] = new Array<string>(cols).fill(initialMaxPath);
  }
  shortestPaths[0][0] = '';
  let unvisited = new Set<string>();
  let visited = new Set<string>();
  unvisited.add('0,0')

  let limit = cols * rows;
  let counter = 0;
  while (unvisited.size > 0 && counter < limit) {
    counter++;
    let minPath = initialMaxPath;
    let currentNodeRow = 0;
    let currentNodeCol = 0;
    let valueToDelete = unvisited.values().next().value;
    for (let value of unvisited) {
      let row = Number(value.split(',')[0])
      let col = Number(value.split(',')[1])
      let currentPath = shortestPaths[row][col]

      if (minPath === initialMaxPath || (currentPath !== initialMaxPath && currentPath.length < minPath.length)) {
        minPath = currentPath;
        currentNodeRow = row;
        currentNodeCol = col;
        valueToDelete = value;
      }
    }

    unvisited.delete(valueToDelete);
    visited.add(valueToDelete)

    // update min path of reachable paths, and update unvisited
    // only update if still at initial path, OR if that current path if bigger than current path
    // node that this also ensures we do not visit a node again as those have a path less than 
    // up
    if (currentNodeRow - 1 >= 0 && data[currentNodeRow - 1][currentNodeCol] !== 1) {
      let currentShortestPath = shortestPaths[currentNodeRow - 1][currentNodeCol];
      if (currentShortestPath === initialMaxPath || currentShortestPath.length > minPath.length + 1) {
        if (!visited.has(`${currentNodeRow - 1},${currentNodeCol}`)) {
          unvisited.add(`${currentNodeRow - 1},${currentNodeCol}`)
          shortestPaths[currentNodeRow - 1][currentNodeCol] = minPath + 'U';
        }
      }
    }
    // right

    if (currentNodeCol + 1 < cols && data[currentNodeRow][currentNodeCol + 1] !== 1) {
      let currentShortestPath = shortestPaths[currentNodeRow][currentNodeCol + 1];
      if (currentShortestPath === initialMaxPath || currentShortestPath.length > minPath.length + 1) {
        if (!visited.has(`${currentNodeRow},${currentNodeCol + 1}`)) {
          shortestPaths[currentNodeRow][currentNodeCol + 1] = minPath + 'R';

          unvisited.add(`${currentNodeRow},${currentNodeCol + 1}`)
        }
      }
    }
    // down
    if (currentNodeRow + 1 < rows && data[currentNodeRow + 1][currentNodeCol] !== 1) {
      let currentShortestPath = shortestPaths[currentNodeRow + 1][currentNodeCol];
      if (currentShortestPath === initialMaxPath || currentShortestPath.length > minPath.length + 1) {
        if (!visited.has(`${currentNodeRow + 1}`)) {
          shortestPaths[currentNodeRow + 1][currentNodeCol] = minPath + 'D';
          unvisited.add(`${currentNodeRow + 1},${currentNodeCol} `)
        }
      }
    }
    // left
    if (currentNodeCol - 1 >= 0 && data[currentNodeRow][currentNodeCol - 1] !== 1) {
      let currentShortestPath = shortestPaths[currentNodeRow][currentNodeCol - 1];
      if (currentShortestPath === initialMaxPath || currentShortestPath.length > minPath.length + 1) {
        if (!visited.has(`${currentNodeRow},${currentNodeCol - 1} `)) {
          shortestPaths[currentNodeRow][currentNodeCol - 1] = minPath + 'L';
          unvisited.add(`${currentNodeRow},${currentNodeCol - 1} `)
        }
      }
    }
  }
  return shortestPaths[rows - 1][cols - 1] === initialMaxPath ? '' : shortestPaths[rows - 1][cols - 1]
}