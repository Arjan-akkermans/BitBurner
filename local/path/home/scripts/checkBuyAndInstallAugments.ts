import { getEarliestFactionWithUnique } from './workForFaction'
import { sortAugments } from './utils'
import { getAllServers } from './utils'
import { run } from './autoPlay'
import { getHighestAugmentRep } from './share-all-loop';
let file = 'data/globals.json';
const neuroFluxGovernor = 'NeuroFlux Governor'
export async function main(ns: NS) {
  let globals = JSON.parse(ns.read(file)) as Globals
  if (globals.activityType === 'CLASS') {
    return
  }
  const ownedAugments = ns.singularity.getOwnedAugmentations()
  if (ownedAugments.includes('The Red Pill') &&
    (ns.getHackingLevel() >= ns.getServerRequiredHackingLevel('w0r1d_d43m0n'))) {
    ns.run('scripts/endBitnode.ts')
    return;
  }
  else if (ownedAugments.includes('The Red Pill') &&
    // if hacking level is close to the required train it,
    // but otherwise keep playing as normal, i.e. we can still buy more servers and NFS
    // which will increase speed more than only training hacking
    ns.getHackingLevel() >= 0.7 * ns.getServerRequiredHackingLevel('w0r1d_d43m0n')) {
    globals.trainHack = true;
    ns.write(file, JSON.stringify(globals), 'w')
    return;
  }
  // this is not an expected case, but might as well install
  if (ownedAugments.length < ns.singularity.getOwnedAugmentations(true).length) {
    ns.run('scripts/installAugments.ts');
  }

  if (ns.gang.inGang()) {
    if (await buyAugmentsFromGang(ns)) {
      return;
    }
  }


  let augments = [] as string[]
  let factionName = getEarliestFactionWithUnique(ns);

  let currentTime = new Date().getTime();

  // if already 1 hour without restart, start saving some cash and then install
  // just here to ensure some progress is made
  let thresholdTimeToReset = 1000 * 60 * 60;
  if (ns.getBitNodeMultipliers().FactionWorkRepGain < 1) {
    // the threshold times are mostly aimed towards normal work rep gain from hacking
    // In BitNode 14 with RepGain at 0.2, this lead to too early resets
    // Therefore this condition aims to give more time if work rep gain is low
    // this factor scales from 1 to 5,i.e.
    // rep gain 1 -> 1
    // rep gain 0.8 -> 1.38
    // rep gain 0.5 -> 2.24
    // rep gain 0.2 -> 3.62
    // rep gain 0 -> 5
    thresholdTimeToReset *= Math.pow(5, 1 - ns.getBitNodeMultipliers().FactionWorkRepGain)
  }

  if (currentTime - ns.getResetInfo().lastAugReset > thresholdTimeToReset) {

    globals.skip = true;
  }

  // add case here such that we reset after hours???
  if (currentTime - ns.getResetInfo().lastAugReset > thresholdTimeToReset * 1.5
    && getAugmentsCost(ns, [neuroFluxGovernor]) <= ns.getServerMoneyAvailable('home')) {
    await buy(ns, factionName ?? ns.enums.FactionName.SlumSnakes, []);
  }
  // ONLY BUY IF CAN DONATE OR BUY AT LEAST 1 AUGMENT? 

  if (!!factionName) {
    let augmentsToBuy = getAugmentsUnilUnique(ns, factionName);

    augmentsToBuy = sortAugments(ns, augmentsToBuy);
    let moneyCost = getAugmentsCost(ns, augmentsToBuy);
    let repCost = getRepCost(ns, augmentsToBuy);
    // if crime got enough money, then we can do it again, probably something wrong with other money gain methods
    if (ns.getMoneySources().sinceInstall.crime > moneyCost) {
      globals.skip = true;
    }

    // keep track of money and rep thresholds,
    // only if close to both, then stop spending money on other things
    let moneyThreshold = globals.lastBatchMoneyGain * 50 > moneyCost || (ns.getServerMoneyAvailable('home') > moneyCost * 1.5);
    let factionRep = ns.singularity.getFactionRep(factionName);
    if (ns.singularity.getFactionFavor(factionName) > ns.getFavorToDonate() && factionRep < repCost) {
      // if can donate, do it first before sharing ram

      let moneyToDonate = Math.max(ns.formulas.reputation.donationForRep(repCost - factionRep, ns.getPlayer()), 0)

      let success = ns.singularity.donateToFaction(factionName, moneyToDonate);
      if (!success) {
        // not enough money?
        return
      }

    }
    // mostly intended for early game, if neuroFlux is not limited by rep, then get some more money such that a few stacks can be bought
    if (ns.singularity.getAugmentationRepReq(neuroFluxGovernor) < repCost) {
      moneyCost *= 1.5;
    }
    if (ns.getServerMoneyAvailable('home') > moneyCost) {
      // determine whether to buy or not is mainly done based on rep/favor

      let decideDoBuyVar = decideDoBuy(ns, factionName, augmentsToBuy);
      if (decideDoBuyVar >= 1) {
        await buy(ns, factionName, augmentsToBuy);
      }
      else {
        if (decideDoBuyVar > 0.85 && moneyThreshold) {
          // if close to rep and money, then set skip to true
          globals.skip = true;
        } else {
          // not really sure if this point is ever reached,
          // but money is reached but rep is not, so just set work to faction just in cases
          globals.activityType = 'FACTION';
        }
      }
    }

    ns.write(file, JSON.stringify(globals), 'w');
  }
  else {
    const augmentsOfFaction = ns.singularity.getAugmentationsFromFaction(ns.enums.FactionName.Sector12);
    for (let i = 0; i < augmentsOfFaction.length; i++) {
      if (!ownedAugments.includes(augmentsOfFaction[i])) {
        augments.push(augmentsOfFaction[i]);
      }
    }
    if (augments.length >= 1) {
      factionName = ns.enums.FactionName.Sector12;
    }
    else {
      const augmentsOfFaction = ns.singularity.getAugmentationsFromFaction(ns.enums.FactionName.TianDiHui);
      for (let i = 0; i < augmentsOfFaction.length; i++) {
        if (!ownedAugments.includes(augmentsOfFaction[i])) {
          augments.push(augmentsOfFaction[i]);
        }
        factionName = ns.enums.FactionName.TianDiHui;
      }
    }
  }

  if (!!factionName && augments.length > 0) {
    // sort on descending cost and dependencies
    augments = sortAugments(ns, augments)

    let hasMoney = hasMoneyForAugments(ns, augments);
    let hasRep = hasRepForAugments(ns, augments, factionName);

    if (hasMoney && hasRep) {

      // buy and install!
      await buy(ns, factionName, augments);
    }
    // no money but rep (unlikely?) set skip to true such that no money is spend
    else if (hasRep) {
      ns.write('data/log/buyAugments.txt', 'setting skip to TRUE! at ' + (new Date().getTime));
      globals.skip = true;
      ns.write(file, JSON.stringify(globals), 'w')
    }
    else {
      const favorLimit = ns.getFavorToDonate();
      // if not enough rep to buy all:
      // donate something if we can (do nothing else such that next time the loop is called we might buy augments))
      // TODO, define proper amount of money to donate based on which augments to buy?
      if (ns.singularity.getFactionFavor(factionName) >= favorLimit) {
        ns.singularity.donateToFaction(factionName, ns.getServerMoneyAvailable('home') * 0.25)
      }
      // if its not possible to donate yet, check if we can reset with a less set without the expensive augments
      // which enables us to donate after installing
      else {
        // enable sharing if currently working for the faction
        const task = ns.singularity.getCurrentWork();
        if (!task || task.type !== "FACTION" || task.factionName !== factionName || task.factionWorkType !== ns.enums.FactionWorkType.hacking) {
          return
        }
        // run share loop which shares ram untill a good breakpoint for rep/favor is reached. then just buy all and reset
        // TODO: refactor such that this ram is freed up?
        // TODO: FIX ME

        ns.tprint('running and waiting share all')
        await run(ns, 'scripts/share-all-loop.ts');
        const augmentsfiltered = augments.filter((augment) => {
          return ns.singularity.getAugmentationRepReq(augment) <= ns.singularity.getFactionRep(factionName)
        })
        await buy(ns, factionName, augmentsfiltered);
      }
    }
  }
}


export async function buy(ns: NS, factionName: string, augments: string[]) {
  let success = true;

  await run(ns, 'scripts/sellStocks.ts');
  augments = addToBuy(ns, augments);
  augments = sortAugments(ns, augments);

  ns.write('data/log/buyAugments.txt', ' buying augments at ' + (new Date().getTime()) + '\n', 'a')
  for (let i = 0; i < augments.length; i++) {
    let factionToBuyFrom = getFactionToBuy(ns, augments[i]);
    if (!!factionToBuyFrom) {
      ns.write('data/log/buyAugments.txt', 'buying augment ' + augments[i] + ' from ' + factionToBuyFrom + ' \n', 'a')
      success = ns.singularity.purchaseAugmentation(factionToBuyFrom, augments[i]);
    }
    else {
      ns.write('data/log/buyAugments.txt', 'cant buy ' + augments[i] + ' because factionToBuy is undefined' + ' \n', 'a')
    }

  }

  // buy ram/core
  let counter = 0;
  while (ns.singularity.getUpgradeHomeRamCost() <= (ns.getServerMoneyAvailable('home') / 10)
    && counter <= 100) {
    counter++
    ns.write('data/log/buyAugments.txt', 'upgrade Ram \n', 'a')
    ns.singularity.upgradeHomeRam();
  }
  counter = 0;
  while (ns.singularity.getUpgradeHomeCoresCost() <= (ns.getServerMoneyAvailable('home') / 10)
    && counter <= 100) {
    counter++
    ns.write('data/log/buyAugments.txt', 'upgrade Cores \n', 'a')
    ns.singularity.upgradeHomeCores();
  }

  // get the faction with highest rep for buying neuroflux governer (and this also filters out gang which does not have it)
  let factionNameForGovernor = factionName;

  let factionNames = ns.getPlayer().factions;
  for (let i = 0; i < factionNames.length; i++) {
    if (hasAugment(ns, factionNames[i], neuroFluxGovernor)) {
      if ((ns.singularity.getFactionFavor(factionNames[i]) >= ns.getFavorToDonate() && ns.singularity.getFactionFavor(factionNameForGovernor) < ns.getFavorToDonate())
        || ns.singularity.getFactionRep(factionNames[i]) > ns.singularity.getFactionRep(factionNameForGovernor)
        || !hasAugment(ns, factionNameForGovernor, neuroFluxGovernor)) {
        factionNameForGovernor = factionNames[i];
      }
    }
  }
  // buy NeuroFlux with remaining money
  success = true;
  while (success) {
    ns.write('data/log/buyAugments.txt', 'buy NeuroFlux Governer \n', 'a')
    success = ns.singularity.purchaseAugmentation(factionNameForGovernor, neuroFluxGovernor);
  }

  // buy ram/core again, now no restriction
  counter = 0;
  while (ns.singularity.getUpgradeHomeRamCost() <= (ns.getServerMoneyAvailable('home'))
    && counter <= 100) {
    counter++
    ns.write('data/log/buyAugments.txt', 'upgrade Ram \n', 'a')
    ns.singularity.upgradeHomeRam();
  }
  counter = 0;
  while (ns.singularity.getUpgradeHomeCoresCost() <= (ns.getServerMoneyAvailable('home'))
    && counter <= 100) {
    counter++
    ns.write('data/log/buyAugments.txt', 'upgrade Cores \n', 'a')
    ns.singularity.upgradeHomeCores();
  }

  // buy NeuroFlux again, but also try to donate
  // buy NeuroFlux with remaining money
  success = true;
  let player = ns.getPlayer();
  while (success && ns.singularity.getFactionFavor(factionNameForGovernor) > ns.getFavorToDonate()) {
    ns.write('data/log/buyAugments.txt', 'buy NeuroFlux Governer after donating \n', 'a');
    let currentRep = ns.singularity.getFactionRep(factionNameForGovernor);
    let nextRep = ns.singularity.getAugmentationRepReq(neuroFluxGovernor);
    let moneyToDonate = Math.max(ns.formulas.reputation.donationForRep(nextRep - currentRep, player), 0)

    success = ns.singularity.donateToFaction(factionNameForGovernor, moneyToDonate);
    success = success && ns.singularity.purchaseAugmentation(factionNameForGovernor, neuroFluxGovernor);
  }
  // donate remaining money, this increases favor and there is nothing else to spend it on
  ns.singularity.donateToFaction(factionNameForGovernor, ns.getServerMoneyAvailable('home'));

  ns.run('scripts/installAugments.ts');
}

export function hasMoneyForAugments(ns: NS, augments: string[]) {
  return getAugmentsCost(ns, augments) <= ns.getServerMoneyAvailable('home');
}

// returns any faction from which the augment can be bought (considering current rep)
// returns undefined if does not exist
export function getFactionToBuy(ns: NS, augment: string) {
  let faction = undefined;
  let factions = ns.getPlayer().factions;

  let factionsWithAugment = ns.singularity.getAugmentationFactions(augment);

  let repReq = ns.singularity.getAugmentationRepReq(augment);

  for (let factionI of factionsWithAugment) {
    if (factions.includes(factionI) && ns.singularity.getFactionRep(factionI) >= repReq) {
      faction = factionI;
      break;
    }
  }

  return faction;
}

// Returns total augments cost assuming:
// No augments are bought yet
// takes into account source file 11 (discount on augment increase)
export function getAugmentsCost(ns: NS, augments: string[]) {
  let moneyRequired = 0;

  let sourceFiles = ns.singularity.getOwnedSourceFiles();
  let sourceFile11 = sourceFiles.find((sourceFile) => sourceFile.n === 1);
  let index = sourceFile11?.lvl ?? 0;

  let power = [1, 0.96, 0.94, 0.93][index];
  // check price on sorted set, sorting ensures reqs are in correct order and sorts based on price
  let augmentsSorted = sortAugments(ns, augments);
  for (let i = 0; i < augmentsSorted.length; i++) { // 2 instead of 1.9 as also some more money is desired
    moneyRequired += ns.singularity.getAugmentationBasePrice(augmentsSorted[i]) * Math.pow(power, i);
  }

  return moneyRequired;
}

export function getRepCost(ns: NS, augments: string[]) {
  let maxRep = augments.reduce((prev, augment) => Math.max(ns.singularity.getAugmentationRepReq(augment), prev), 0);
  return maxRep;
}

export function hasRepForAugments(ns: NS, augments: string[], factionName: string) {
  return augments.every((augment) => {
    return ns.singularity.getAugmentationRepReq(augment) <= ns.singularity.getFactionRep(factionName)
  });
}

export function hasAugment(ns: NS, faction: string, augment: string) {
  return ns.singularity.getAugmentationsFromFaction(faction).some((augmentOfFaction) => augmentOfFaction === augment)
}
// returns TRUE if anything is bought
export async function buyAugmentsFromGang(ns: NS) {
  const ownedAugments = ns.singularity.getOwnedAugmentations()
  let gangInformation = ns.gang.getGangInformation();
  let factionName = gangInformation.faction;
  let augmentsOfGang = ns.singularity.getAugmentationsFromFaction(factionName);
  augmentsOfGang.sort((a, b) => {
    const statsA = ns.singularity.getAugmentationStats(a);
    const statsB = ns.singularity.getAugmentationStats(b);
    let diff = statsB.hacking - statsA.hacking;
    if (diff === 0) {
      diff = statsB.hacking_speed - statsA.hacking_speed;
    }
    if (diff === 0) {
      diff = statsB.faction_rep - statsB.faction_rep;
    }
    if (diff === 0) {
      diff = statsB.hacking_grow - statsA.hacking_grow;
    }
    return diff
  })

  // filter by rep
  let augmentsFiltered = augmentsOfGang.filter((augment) => ns.singularity.getAugmentationRepReq(augment) <= ns.singularity.getFactionRep(factionName))
  // filter by owned
  augmentsFiltered = augmentsFiltered.filter((augment) => { return ownedAugments.every((ownedAugment) => { return ownedAugment !== augment }) });
  let amountUnOwned = augmentsFiltered.length;
  // filter by dependencies, keep it simple just filter on all prereqs owned
  augmentsFiltered = augmentsFiltered.filter((augment) => { return ns.singularity.getAugmentationPrereq(augment).every((preReq) => { return ownedAugments.some((ownedAugment) => ownedAugment === preReq) }) })
  // fiter by money
  augmentsFiltered = augmentsFiltered.filter((augment) => { return ns.singularity.getAugmentationBasePrice(augment) <= ns.getServerMoneyAvailable('home') });

  if (augmentsFiltered.length === 0) {
    return false;
  }
  // only buy augments if at least this many are available to be bought!
  let i = Math.min(augmentsFiltered.length, 5);
  // Case to ensure that if the minimum is not available the remaining augments will still be bought
  i = Math.min(i, amountUnOwned);
  let allAugmentsRemainingLength = augmentsFiltered.length;
  if (augmentsFiltered.length >= i) {

    let augmentsToBuy = augmentsFiltered.slice(0, i);
    if (hasMoneyForAugments(ns, augmentsToBuy)) {
      while (hasMoneyForAugments(ns, augmentsToBuy) && i < 1000 && i < augmentsFiltered.length) {

        augmentsToBuy.push(augmentsFiltered[i])
        // TODO this is ugly way to cover the case where all augments can be bought
        if (augmentsToBuy.length === allAugmentsRemainingLength && hasMoneyForAugments(ns, augmentsToBuy)) {
          await buy(ns, factionName, augmentsToBuy);
          return true;
        }
        i++
      }

      augmentsToBuy = augmentsToBuy.slice(0, i - 1);
      await buy(ns, factionName, augmentsToBuy);
      return true;
    }
  }

  return false;
}

// add any augments which are buyable
export function addToBuy(ns: NS, augments: string[]) {

  let factions = ns.getPlayer().factions;
  let ownedAugmentations = ns.singularity.getOwnedAugmentations(true);
  ownedAugmentations = ownedAugmentations.concat(augments);
  let newAugments = new Set<string>;
  let augmentsToBuy = [...augments];

  // get all augments which are available and not yet owned/in input set
  for (let faction of factions) {
    let augmentsOfFaction = ns.singularity.getAugmentationsFromFaction(faction);
    for (let augment of augmentsOfFaction) {
      let factionRep = ns.singularity.getFactionRep(faction);
      if (factionRep >= ns.singularity.getAugmentationRepReq(augment)
        && !ownedAugmentations.includes(augment)) {
        newAugments.add(augment);
      }
    }
  }
  let newAugmentsToConsider = [...newAugments];
  let counter = 0;
  while (newAugmentsToConsider.length > 0 && counter < 1000) {
    counter++;

    let augmentsAvailable = ownedAugmentations.concat(augmentsToBuy);

    let augmentsThisIteration = newAugmentsToConsider.filter((newAugment) => hasAllPreReqs(ns, newAugment, augmentsAvailable));
    if (augmentsThisIteration.length === 0) {
      break;
    }
    augmentsThisIteration.sort((a, b) => {
      let statsA = ns.singularity.getAugmentationStats(a);
      let statsB = ns.singularity.getAugmentationStats(b);

      if (statsB.hacking > statsA.hacking) {
        return -1
      }
      else if (statsB.crime_money > statsA.crime_money) {
        return -1;
      }
      else if (statsB.hacking_speed > statsA.hacking_speed) {
        return -1
      }
      else if (statsB.hacking_grow > statsA.hacking_grow) {
        return -1
      }
      else if (statsB.hacking_exp > statsA.hacking_exp) {
        return -1;
      }
      else {  // else most expensive augment first
        return ns.singularity.getAugmentationPrice(b) - ns.singularity.getAugmentationPrice(a);
      }
    })

    let augmentsConsiderBuying = [...augmentsToBuy, augmentsThisIteration[0]];
    if (!hasMoneyForAugments(ns, augmentsConsiderBuying)) {
      break;
    }
    else {
      augmentsToBuy = [...augmentsConsiderBuying];
      // cut off first augment so we do not consider it again
      newAugmentsToConsider = newAugmentsToConsider.filter((n) => n !== augmentsThisIteration[0])
    }
  }
  return augmentsToBuy;
}

export function hasAllPreReqs(ns: NS, augment: string, augmentsAvailable: string[]) {
  return ns.singularity.getAugmentationPrereq(augment).every((preReq) => { return augmentsAvailable.some((ownedAugment) => ownedAugment === preReq) });
}

export function getAugmentsUnilUnique(ns: NS, faction: string) {
  const ownedAugments = ns.singularity.getOwnedAugmentations(true);
  // only care about rep gain
  if (faction === ns.enums.FactionName.TianDiHui) {

    let repGainAugments = ns.singularity.getAugmentationsFromFaction(ns.enums.FactionName.TianDiHui);
    repGainAugments = repGainAugments.filter((r) => r !== neuroFluxGovernor);
    repGainAugments = repGainAugments.filter((augmentOfT) => (ns.singularity.getAugmentationStats(augmentOfT).faction_rep ?? 1) > 1);

    // if there is unowned rep gain, then return all of them as these are needed early game
    if (
      repGainAugments.some((repGain) => !ownedAugments.includes(repGain)))
      return repGainAugments;
  }

  if (faction === ns.enums.FactionName.CyberSec) {
    return ['BitWire', 'Synaptic Enhancement Implant', 'Neurotrainer I']
  }

  // slum snakes is done for crime money, hence return crime money augments
  if (faction === ns.enums.FactionName.SlumSnakes) {
    let augmentsSlumSnakes = ns.singularity.getAugmentationsFromFaction(ns.enums.FactionName.SlumSnakes);
    let crimeMoneyAugments = augmentsSlumSnakes.filter((augment) => ns.singularity.getAugmentationStats(augment).crime_money > 1);
    return crimeMoneyAugments;
  }


  const allAugments = ns.singularity.getAugmentationsFromFaction(faction);

  const allUnownedAugments = allAugments.filter((augment) => ownedAugments.find((ownedAugment) => augment === ownedAugment) === undefined);
  let maxUnique = undefined;
  let maxUniqueRep = 0;

  // do Nitesec in 2 parts
  if (faction === ns.enums.FactionName.NiteSec && !ownedAugments.includes('Cranial Signal Processors - Gen I')) {
    maxUniqueRep = ns.singularity.getAugmentationRepReq('Cranial Signal Processors - Gen I');
    maxUnique = ('Cranial Signal Processors - Gen I');
  }
  else {
    for (let augment of allUnownedAugments) {
      if (isUniqueAugments(ns, augment) && (maxUnique === undefined || ns.singularity.getAugmentationRepReq(augment) > maxUniqueRep)) {
        maxUnique = augment;
        maxUniqueRep = ns.singularity.getAugmentationRepReq(augment);
      }
    }
  }

  let augmentsToBuy = allUnownedAugments;
  if (maxUnique) {
    augmentsToBuy = augmentsToBuy.filter((augment) => ns.singularity.getAugmentationRepReq(augment) <= maxUniqueRep);
  }


  return augmentsToBuy;
}

export function isUniqueAugments(ns: NS, augment: string) {
  return ns.singularity.getAugmentationFactions(augment).length === 1
}

// buy and reset if either:
// - there is enough rep to buy all augments
// - when resetting there is enough favor to donate
// - when resetting there is a 'significant' boost to the new rep gain

// returns a >=1 if buying should be done
// otherwise returns a number [0-1] indicating how close to resetting we are
export function decideDoBuy(ns: NS, factionName: string, augments: string[]) {

  const favorThreshold = 50;
  // reset if enough rep to buy all augments
  const repCost = getRepCost(ns, augments);
  const currentRep = ns.singularity.getFactionRep(factionName);
  const favorGain = ns.singularity.getFactionFavorGain(factionName);
  const favor = ns.singularity.getFactionFavor(factionName);
  const favorToDonate = ns.getFavorToDonate();
  let hasRep = repCost <= currentRep;
  if (hasRep) {
    ns.tprint('returning 1 as rep is met');
    return 1;
  }
  // reset if enough favor to donate
  if (favor + favorGain >= favorToDonate) {
    ns.tprint('retrning 1 as favor is met')
    return 1;
  }

  // get favor untill either can donate or threshold
  let favorToGain = Math.min(favorToDonate - favor, favorThreshold);
  // if 'close' to donation, then set favor to gain to the amount needed to donate
  if (favor + favorGain + 1 / 3 * favorThreshold >= favorToDonate) {
    favorToGain = favorToDonate - favor;
  }


  const ratioToRepGoal = currentRep / repCost;
  const ratioToFavorGoal = favorGain / favorToGain;
  return Math.max(ratioToRepGoal, ratioToFavorGoal);
}
