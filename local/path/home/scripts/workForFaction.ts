let file = 'data/globals.json';
export async function main(ns: NS) {
  const ownedAugmentations = ns.singularity.getOwnedAugmentations();
  let globals = JSON.parse(ns.read(file)) as Globals

  if (globals.factionToWorkFor.length > 0) {
    workHackingForFaction(ns, globals.factionToWorkFor)
  }
  if (!ns.gang.inGang()) {
    return; // return such that we keep homiciding
  }


  // inGang hence no need to homicide anymore
  globals.activityType = 'FACTION';
  ns.write(file, JSON.stringify(globals), 'w');
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

  const ownedAugmentations = ns.singularity.getOwnedAugmentations();
  if (ownedAugmentations.length === 0) {
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
    return ns.singularity.workForFaction(factionName, ns.enums.FactionWorkType.hacking, false)
  }
  else {
    // already working for the faction
    return true;
  }
}