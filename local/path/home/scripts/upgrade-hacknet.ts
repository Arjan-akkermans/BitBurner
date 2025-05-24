/** @param {NS} ns
 * @param startingRam number
 */


export async function main(ns: NS) {
  const moneySpend = await upgradeHacknet(ns);
  ns.writePort(3, moneySpend);
}

export async function upgradeHacknet(ns: NS) {

  let moneySpend = 0;

  // purchase cost hard limit for now 100M, 5B below!
  let counter = 0;
  while (ns.hacknet.getPurchaseNodeCost() < ns.getServerMoneyAvailable("home") && ns.hacknet.getPurchaseNodeCost() < 5000000000 && ns.hacknet.numNodes() < ns.hacknet.maxNumNodes() && counter < 100) {
    counter++
    moneySpend += ns.hacknet.getPurchaseNodeCost();
    ns.hacknet.purchaseNode();
  }


  // idk hardcoded limit of 10 bil for now?
  // applies to total hacknet server cost (also to individual upgrade, but thats a failsafe?)

  const limitHard = 10000000000;
  ns.formulas.hacknetServers.hacknetServerCost
  function upgradeAll(i: number, limit: number) {
    let currentHacknet = ns.hacknet.getNodeStats(i);
    let totalCost = getNodeCost(ns, ns.hacknet.getNodeStats(i))

    if (totalCost >= limitHard) {
      return false;
    }
    // determine best cost for gain;
    let levelDiff = 0;
    let ramDiff = 0;
    let coreDiff = 0;
    let cacheDiff = 0;
    if (ns.hacknet.getLevelUpgradeCost(i, 1) <= ns.getServerMoneyAvailable("home") * limit
      && ns.hacknet.getLevelUpgradeCost(i, 1) <= limitHard) {


      let upgradedHacknet = { ...currentHacknet };
      upgradedHacknet.level = upgradedHacknet.level + 1;
      const difference = getProductionDifference(ns, upgradedHacknet, currentHacknet);
      let upgradeCost = ns.hacknet.getLevelUpgradeCost(i, 1);
      levelDiff = difference / upgradeCost;

      if (ns.hacknet.getRamUpgradeCost(i, 1) <= ns.getServerMoneyAvailable("home") * limit
        && ns.hacknet.getRamUpgradeCost(i, 1) <= limitHard) {
        let upgradedHacknet = { ...currentHacknet };
        upgradedHacknet.ram = upgradedHacknet.ram * 2;
        const difference = getProductionDifference(ns, upgradedHacknet, currentHacknet);
        let upgradeCost = ns.hacknet.getRamUpgradeCost(i, 1);

        ramDiff = difference / upgradeCost;
      }
      if (ns.hacknet.getCoreUpgradeCost(i, 1) <= ns.getServerMoneyAvailable("home") * limit
        && ns.hacknet.getCoreUpgradeCost(i, 1) <= limitHard) {
        let upgradedHacknet = { ...currentHacknet };
        upgradedHacknet.cores = upgradedHacknet.cores + 1;
        const difference = getProductionDifference(ns, upgradedHacknet, currentHacknet);
        let upgradeCost = ns.hacknet.getCoreUpgradeCost(i, 1);

        coreDiff = difference / upgradeCost;
      } if (ns.hacknet.getCacheUpgradeCost(i, 1) <= ns.getServerMoneyAvailable("home") * limit) {
        let upgradedHacknet = { ...currentHacknet };
        if (upgradedHacknet.cache !== undefined) {
          upgradedHacknet.cache = upgradedHacknet.cache + 1;
          const difference = getProductionDifference(ns, upgradedHacknet, currentHacknet);
          let upgradeCost = ns.hacknet.getCacheUpgradeCost(i, 1);

          cacheDiff = difference / upgradeCost;
        }
      }

    }

    let best = Math.max(levelDiff, ramDiff, coreDiff, cacheDiff);
    if (best === 0) {
      return false;
    }
    else {
      if (levelDiff === best) {
        if (ns.hacknet.upgradeLevel(i, 1)) {
          moneySpend += ns.hacknet.getLevelUpgradeCost(i, 1)
        }
      }
      else if (ramDiff === best) {
        if (ns.hacknet.upgradeRam(i, 1)) {
          moneySpend += ns.hacknet.getRamUpgradeCost(i, 1)
        }
      }
      else if (coreDiff === best) {
        if (ns.hacknet.upgradeCore(i, 1)) {
          moneySpend += ns.hacknet.getCoreUpgradeCost(i, 1)
        }
      }
      else if (cacheDiff === best) {
        if (ns.hacknet.upgradeCache(i, 1)) {
          moneySpend += ns.hacknet.getCacheUpgradeCost(i, 1)
        }
      }
      return true;
    }
  }

  // upgrade function above is 1 by 1
  // it returns true if at least one thing is upgraded
  // so keep looping over each cost limit untill nothing is upgraded anymore
  let doUpgrade = true;
  while (doUpgrade) {
    doUpgrade = false;
    for (let i = 0; i < ns.hacknet.numNodes(); i++) {
      doUpgrade = upgradeAll(i, 0.01);
    }
  }

  doUpgrade = true;
  while (doUpgrade) {
    doUpgrade = false;
    for (let i = 0; i < ns.hacknet.numNodes(); i++) {
      doUpgrade = upgradeAll(i, 0.1);
    }
  }

  doUpgrade = true;
  while (doUpgrade) {
    doUpgrade = false;
    for (let i = 0; i < ns.hacknet.numNodes(); i++) {
      doUpgrade = upgradeAll(i, 0.25);
    }
  }
  doUpgrade = true;
  while (doUpgrade) {
    doUpgrade = false;
    for (let i = 0; i < ns.hacknet.numNodes(); i++) {
      doUpgrade = upgradeAll(i, 1);
    }
  }

  // purchase cost hard limit for now 100M, 5B below!
  counter = 0;
  while (ns.hacknet.getPurchaseNodeCost() < ns.getServerMoneyAvailable("home") && ns.hacknet.getPurchaseNodeCost() < 5000000000 && ns.hacknet.numNodes() < ns.hacknet.maxNumNodes() && counter < 100) {
    counter++
    moneySpend += ns.hacknet.getPurchaseNodeCost();
    ns.hacknet.purchaseNode();
  }


  return moneySpend;
}


export function getHacknetLevel(ns: NS) {
  let level = 0;
  for (let i = 0; i < ns.hacknet.numNodes(); i++) {
    level += ns.hacknet.getNodeStats(i).level;
  }
  return level;
}


export function getProductionDifference(ns: NS, nodeA: NodeStats, nodeB: NodeStats) {
  const productionA = getProduction(ns, nodeA);
  const productionB = getProduction(ns, nodeB);

  return productionA - productionB;
}

/*
* returns the production of the hacknetServer, assuming direct conversion to money
*/
export function getProduction(ns: NS, node: NodeStats) {
  const player = ns.getPlayer();
  let production = ns.formulas.hacknetServers.hashGainRate(node.level, 0, node.ram, node.cores, player.mults.hacknet_node_money);
  const secondsForBuying = 4 / production;
  return 1000000 / secondsForBuying;
}

// returns the amount of money to buy this node
export function getNodeCost(ns: NS, node: NodeStats) {
  let mults = ns.getPlayer().mults

  let cost = 0;
  let ramLevels = Math.log2(node.ram);

  cost += ns.formulas.hacknetServers.levelUpgradeCost(1, node.level - 1, mults.hacknet_node_level_cost);
  cost += ns.formulas.hacknetServers.ramUpgradeCost(1, ramLevels, mults.hacknet_node_ram_cost);
  cost += ns.formulas.hacknetServers.coreUpgradeCost(1, node.cores - 1, mults.hacknet_node_core_cost);
  if (node.cache !== undefined) {
    cost += ns.formulas.hacknetServers.cacheUpgradeCost(1, node.cache - 1);
  }
  return cost;
}