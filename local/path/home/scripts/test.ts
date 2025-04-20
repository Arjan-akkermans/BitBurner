import { sortAugments, getXpNeeded } from './utils'
import { infectServer, getServerToHack } from './utils'
import { getProduction, getProductionDifference, getNodeCost } from './upgrade-hacknet'
import { buyAugmentsFromGang } from './checkBuyAndInstallAugments'
export async function main(ns: NS) {
  ns.tprint(getNodeCost(ns, ns.hacknet.getNodeStats(0)));
}

export function rigCasino(ns: NS) {
  Math.floor = (number) => { return 1 }; Math.random = () => { return 0 };
}

