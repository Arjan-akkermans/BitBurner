import { sortAugments, getXpNeeded } from './utils'
import { infectServer, getServerToHack, getAllServers } from './utils'
import { getProduction, getProductionDifference, getNodeCost } from './upgrade-hacknet'
import { buyAugmentsFromGang } from './checkBuyAndInstallAugments'
export async function main(ns: NS) {
  rigCasino(ns);
}

export function rigCasino(ns: NS) {
  Math.floor = (number) => { return 1 }; Math.random = () => { return 0 };
}

