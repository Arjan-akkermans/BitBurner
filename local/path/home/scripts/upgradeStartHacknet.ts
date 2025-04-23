
// script meant to upgrade starting hacknet
export async function main(ns: NS) {

  let counter = 0;
  if (ns.hacknet.numNodes() === 1 &&
    ns.hacknet.getNodeStats(0).ram < 16 && counter < 5) {
    counter++;
    ns.hacknet.upgradeRam(0, 1);
  }

}