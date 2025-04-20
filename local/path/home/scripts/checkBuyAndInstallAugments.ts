import { getEarliestFactionWithUnique } from './workForFaction'
import { sortAugments } from './utils'
import { getAllServers } from './utils'
import { run } from './autoPlay'
let file = 'data/globals.json';
export async function main(ns: NS) {
  let globals = JSON.parse(ns.read(file)) as Globals
  if (globals.activityType === 'CLASS') {
    return
  }
  const ownedAugments = ns.singularity.getOwnedAugmentations()
  if (ownedAugments.includes('The Red Pill') &&
    (ns.getHackingLevel() >= 0.8 * ns.getServerRequiredHackingLevel('w0r1d_d43m0n'))) {
    ns.run('scripts/endBitnode.ts')
    return;
  }
  else if (ownedAugments.includes('The Red Pill')) {
    globals.trainHack = true;
    ns.write(file, JSON.stringify(globals), 'w')
    return;
  }
  // this is not an expected case, but might as well install
  if (ownedAugments.length < ns.singularity.getOwnedAugmentations(true).length) {
    ns.run('scripts/installAugments.ts');
  }

  if (ns.gang.inGang) {
    if (buyAugmentsFromGang(ns)) {
      return;
    }
  }

  /*
    let x = getFactionToBuyGreedy(ns);
    let factionName = x.factionToBuyFrom;
    let augments = x.augmentsToBuy;
  
    if (!!factionName) {
      buy(ns, factionName, augments);
      return
    }*/

  let augments = [] as string[]
  let factionName = getEarliestFactionWithUnique(ns);
  if (!!factionName) {

    globals.factionToWorkFor = factionName;
    ns.write(file, JSON.stringify(globals), 'w')
    if (factionName === ns.enums.FactionName.CyberSec) {
      augments = ['Neurotrainer I', 'Synaptic Enhancement Implant', 'BitWire']
    }
    else {
      const augmentsOfFaction = ns.singularity.getAugmentationsFromFaction(factionName);
      for (let i = 0; i < augmentsOfFaction.length; i++) {
        if (!ownedAugments.includes(augmentsOfFaction[i])) {
          // exlude expensive non faction unique:
          if (!(factionName === ns.enums.FactionName.NiteSec && augmentsOfFaction[i] === 'DataJack')
            && !(factionName === ns.enums.FactionName.TheBlackHand && augmentsOfFaction[i] === 'Embedded Netburner Module Core Implant')
            && !(factionName === ns.enums.FactionName.TheBlackHand && augmentsOfFaction[i] === 'Cranial Signal Processors - Gen IV')) { augments.push(augmentsOfFaction[i]); }
        }
      }
    }
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
      buy(ns, factionName, augments);
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
      if (ns.singularity.getFactionFavor(factionName) >= favorLimit) {
        ns.singularity.donateToFaction(factionName, ns.getServerMoneyAvailable('home') * 0.10)
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
        ns.tprint('running and waiting share all')
        await run(ns, 'scripts/share-all-loop.ts');
        const augmentsfiltered = augments.filter((augment) => {
          return ns.singularity.getAugmentationRepReq(augment) <= ns.singularity.getFactionRep(factionName)
        })
        buy(ns, factionName, augmentsfiltered);
      }
    }
  }
}


export function buy(ns: NS, factionName: string, augments: string[]) {
  let success = true;

  ns.write('data/log/buyAugments.txt', ' buying augments at ' + (new Date().getTime) + '/n', 'a')
  for (let i = 0; i < augments.length; i++) {
    ns.write('data/log/buyAugments.txt', 'buying augment ' + augments[i] + ' /n', 'a')
    success = ns.singularity.purchaseAugmentation(factionName, augments[i]);
  }


  // buy ram/core
  let counter = 0;
  while (ns.singularity.getUpgradeHomeRamCost() <= (ns.getServerMoneyAvailable('home') / 10)
    && counter <= 100) {
    counter++
    ns.write('data/log/buyAugments.txt', 'upgrade Ram /n', 'a')
    ns.singularity.upgradeHomeRam();
  }
  counter = 0;
  while (ns.singularity.getUpgradeHomeCoresCost() <= (ns.getServerMoneyAvailable('home') / 10)
    && counter <= 100) {
    counter++
    ns.write('data/log/buyAugments.txt', 'upgrade Cores /n', 'a')
    ns.singularity.upgradeHomeCores();
  }

  // get the faction with highest rep for buying neuroflux governer (and this also filters out gang which does not have it)
  let factionNameForGovernor = factionName;
  const neuroFluxGovernor = 'NeuroFlux Governor'
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
    ns.write('data/log/buyAugments.txt', 'buy NeuroFlux Governer /n', 'a')
    success = ns.singularity.purchaseAugmentation(factionNameForGovernor, neuroFluxGovernor);
  }

  // buy ram/core again, now no restriction
  counter = 0;
  while (ns.singularity.getUpgradeHomeRamCost() <= (ns.getServerMoneyAvailable('home'))
    && counter <= 100) {
    counter++
    ns.write('data/log/buyAugments.txt', 'upgrade Ram /n', 'a')
    ns.singularity.upgradeHomeRam();
  }
  counter = 0;
  while (ns.singularity.getUpgradeHomeCoresCost() <= (ns.getServerMoneyAvailable('home'))
    && counter <= 100) {
    counter++
    ns.write('data/log/buyAugments.txt', 'upgrade Cores /n', 'a')
    ns.singularity.upgradeHomeCores();
  }

  // buy NeuroFlux again, but also try to donate
  // buy NeuroFlux with remaining money
  success = true;
  let player = ns.getPlayer();
  while (success && ns.singularity.getFactionFavor(factionNameForGovernor) > ns.getFavorToDonate()) {
    ns.write('data/log/buyAugments.txt', 'buy NeuroFlux Governer after donating /n', 'a');
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

  let moneyRequired = 0;
  for (let i = 0; i < augments.length; i++) { // 2 instead of 1.9 as also some more money is desired
    moneyRequired += ns.singularity.getAugmentationBasePrice(augments[i]) * ns.getBitNodeMultipliers().AugmentationMoneyCost * Math.pow(2, i)
  }
  return moneyRequired <= ns.getServerMoneyAvailable('home');
}

export function hasRepForAugments(ns: NS, augments: string[], factionName: string) {
  return augments.every((augment) => {
    return ns.singularity.getAugmentationRepReq(augment) <= ns.singularity.getFactionRep(factionName)
  });
}

export function hasAugment(ns: NS, faction: string, augment: string) {
  return ns.singularity.getAugmentationsFromFaction(faction).some((augmentOfFaction) => augmentOfFaction === augment)
}

/* returns a faction which has hacking augments and from which all augments can be bought*/
export function getFactionToBuyGreedy(ns: NS) {

  const factions = ns.getPlayer().factions;
  const ownedAugmentations = ns.singularity.getOwnedAugmentations();
  let augmentsToBuy = [] as string[];
  let currentBestEvaluation = 0;
  let factionToBuyFrom = undefined;
  for (let i = 0; i < factions.length; i++) {
    let augmentsToBuyLoop = [] as string[];
    // get the set of all augmentations that are not yet bought from this faction
    // consider only factions from which all augmentations can be bought
    // among those buy the one with highest evaluation
    const augmentationsFromFaction = ns.singularity.getAugmentationsFromFaction(factions[i]);
    for (let j = 0; j < augmentationsFromFaction.length; j++) {
      if (!ownedAugmentations.includes(augmentationsFromFaction[j])) {
        augmentsToBuyLoop.push(augmentationsFromFaction[j])
      }
    }
    if (augmentsToBuyLoop.length > 0) {
      // sort on descending cost and dependencies
      augmentsToBuyLoop = sortAugments(ns, augmentsToBuyLoop)

      let hasMoney = hasMoneyForAugments(ns, augmentsToBuyLoop);
      let hasRep = hasRepForAugments(ns, augmentsToBuyLoop, factions[i]);
      if (hasMoney && hasRep) {
        const objective = augmentsToBuyLoop.reduce((counter, augment) => {
          const stats = ns.singularity.getAugmentationStats(augment);
          // bit or a random evaluation, but hacking should be most important!
          return counter + (100 * (stats.hacking - 1))
            + stats.hacking_speed - 1
            + stats.hacking_grow - 1
            + stats.hacking_money - 1
            + stats.hacking_exp - 1
        }
          , 0);
        if (objective > currentBestEvaluation) {
          currentBestEvaluation = objective;
          factionToBuyFrom = factions[i];
          augmentsToBuy = [...augmentsToBuyLoop];

        }
      }
    }
  }
  return { factionToBuyFrom, augmentsToBuy };
}

// returns TRUE if anything is bought
export function buyAugmentsFromGang(ns: NS) {
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

  // filter by dependencies, keep it simple just filter on all prereqs owned
  augmentsFiltered = augmentsFiltered.filter((augment) => { return ns.singularity.getAugmentationPrereq(augment).every((preReq) => { return ownedAugments.some((ownedAugment) => ownedAugment === preReq) }) })

  // only buy augments if at least this many are available to be bought!
  let i = 5;
  if (augmentsFiltered.length >= i && false) {

    let augmentsToBuy = augmentsFiltered.slice(0, i);
    if (hasMoneyForAugments(ns, augmentsToBuy)) {
      while (hasMoneyForAugments(ns, augmentsToBuy) && i < 1000) {
        i++

        augmentsToBuy.push(augmentsFiltered[i])
      }
      augmentsToBuy = augmentsToBuy.slice(0, i - 1);
      buy(ns, factionName, augmentsToBuy);
      return true;
    }
  }

  return false;
}