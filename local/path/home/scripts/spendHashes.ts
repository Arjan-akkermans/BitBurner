import { sortAugments } from './utils'
import { getAllServers } from './utils'
import { updateSkip } from './utils'
export async function main(ns: NS) {

  let counter = 0;
  let limitCodingcontract = 3000;
  /*
  let buyCodingContracts = ns.hacknet.hashCost('Generate Coding Contract') < limitCodingcontract;
  while (ns.hacknet.hashCost('Generate Coding Contract') < limitCodingcontract && ns.hacknet.numHashes() >= ns.hacknet.hashCost('Generate Coding Contract') && counter < 1000) {
    counter++
    ns.hacknet.spendHashes('Generate Coding Contract');
  }*/

  if (true) {
    while (counter < 100000 && ns.hacknet.numHashes() > 4) {
      counter++;
      ns.hacknet.spendHashes('Sell for Money');
    }
  }
}