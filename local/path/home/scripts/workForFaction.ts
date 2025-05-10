let file = 'data/globals.json';

import { acceptFactionInvitations } from './acceptFactionInvitation'

export async function main(ns: NS) {
  const ownedAugmentations = ns.singularity.getOwnedAugmentations();
  let globals = JSON.parse(ns.read(file)) as Globals

  if (globals.factionToWorkFor.length > 0) {
    acceptFactionInvitations(ns); // TODO REMOVE?
    workHackingForFaction(ns, globals.factionToWorkFor)
    return;
  }
  if (!ns.gang.inGang() && globals.startGang === true) {
    return; // return such that we keep homiciding
  }

  if (ns.gang.inGang()) {
    globals.activityType = 'FACTION';
    ns.write(file, JSON.stringify(globals), 'w');
  }
  // inGang hence no need to homicide anymore

  /*
  let hardcodedFaction = ns.enums.FactionName.CyberSec;
  if (ns.getPlayer().factions.includes(hardcodedFaction)) {
    workHackingForFaction(ns, hardcodedFaction);
  }
  else {
    ns.singularity.travelToCity(ns.enums.CityName.Chongqing);
  }
  ns.tprint('work for faction currently hard coded');
  return*/

  // to reach limit of 30
  const otherFactions = [ns.enums.FactionName.Sector12
    , ns.enums.FactionName.TianDiHui]

  let factionToWorkFor = getEarliestFactionWithUnique(ns);
  if (factionToWorkFor) {
    workHackingForFaction(ns, factionToWorkFor)
  }
  // search for the earliest faction with an not yet bought unique augmentation where rep is not yet reached
  // if found work for it


  else {
    let workFound = false;
    for (let i = 0; i < otherFactions.length && !workFound; i++) {
      const augmentationsFromFaction = ns.singularity.getAugmentationsFromFaction(otherFactions[i]);
      for (let j = 0; j < augmentationsFromFaction.length; j++) {
        if (!ownedAugmentations.includes(augmentationsFromFaction[j])) {
          {
            const startWorking = workHackingForFaction(ns, otherFactions[i])
            if (!startWorking) {
              // if invite not succesfull, move to correct city and hope next time we can work!
              if (otherFactions[i] === ns.enums.FactionName.Sector12) {
                ns.singularity.travelToCity(ns.enums.CityName.Sector12)
              }
              else if (otherFactions[i] === ns.enums.FactionName.TianDiHui) {
                ns.singularity.travelToCity(ns.enums.CityName.Chongqing);
              }
            }
            else {
              break;
            }
          }
        }
      }
    }
  }
}

export function getEarliestFactionWithUnique(ns: NS) {

  let factionsOfPlayer = ns.getPlayer().factions;
  const ownedAugmentations = ns.singularity.getOwnedAugmentations();
  // get rep gain augments from TianDiHui
  let augmentsOfT = ns.singularity.getAugmentationsFromFaction(ns.enums.FactionName.TianDiHui)
  let repGainAugments = augmentsOfT.filter((augmentOfT) => (ns.singularity.getAugmentationStats(augmentOfT).faction_rep ?? 1) > 1);

  // if there is an unowned rep gain, and not yet joing faction join it by traveling to it
  if (
    repGainAugments.some((repGain) => !ownedAugmentations.includes(repGain))
    && !factionsOfPlayer.includes(ns.enums.FactionName.TianDiHui)) {
    ns.singularity.travelToCity(ns.enums.CityName.Chongqing);
    return ns.enums.FactionName.TianDiHui;
  }
  else if (
    // joined TianDiHui, and there are unbought augments which boost rep gain -> work
    repGainAugments.some((repGain) => !ownedAugmentations.includes(repGain))) {
    return ns.enums.FactionName.TianDiHui
  }
  else if (ns.getBitNodeMultipliers().CrimeMoney >= 2) {
    if (!ownedAugmentations.includes('SmartSonar Implant')) {
      return ns.enums.FactionName.SlumSnakes;
    }
  }

  // only 2 rep boost and/or neuroflux, start with cybersec (has no unique)
  if (!ownedAugmentations.includes('BitWire')) {
    return ns.enums.FactionName.CyberSec;
  }
  // for hacking augments
  const factions = [ns.enums.FactionName.CyberSec
    // , ns.enums.FactionName.TianDiHui
    , ns.enums.FactionName.NiteSec
    , ns.enums.FactionName.TheBlackHand
    , ns.enums.FactionName.BitRunners
    , ns.enums.FactionName.Daedalus
    , ns.enums.FactionName.TheCovenant
    , ns.enums.FactionName.Illuminati];

  let factionToWorkFor = undefined;
  for (let i = 0; i < factions.length && !factionToWorkFor; i++) {
    const augmentationsFromFaction = ns.singularity.getAugmentationsFromFaction(factions[i]);
    for (let j = 0; j < augmentationsFromFaction.length; j++) {
      if (ns.singularity.getAugmentationFactions(augmentationsFromFaction[j]).length === 1
        && !ownedAugmentations.includes(augmentationsFromFaction[j])) {

        factionToWorkFor = factions[i];
        break;
      }
    }
  }
  return factionToWorkFor;
}

/*
* only start working if not already working (to avoid mutliple popups!)
*/
export function workHackingForFaction(ns: NS, factionName: string) {
  const task = ns.singularity.getCurrentWork();
  if (!task || task.type !== "FACTION" || task.factionName !== factionName || task.factionWorkType !== ns.enums.FactionWorkType.hacking) {
    // TODO REFACTOR
    if (factionName === ns.enums.FactionName.SlumSnakes) {
      return ns.singularity.workForFaction(factionName, ns.enums.FactionWorkType.security, false)
    }
    else {
      return ns.singularity.workForFaction(factionName, ns.enums.FactionWorkType.hacking, false)
    }
  }
  else {
    // already working for the faction
    return true;
  }
}