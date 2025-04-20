export async function main(ns: NS) {

  if (ns.getServerMoneyAvailable('home') >= ns.singularity.getUpgradeHomeRamCost()) {
    ns.singularity.upgradeHomeRam();
  }
}