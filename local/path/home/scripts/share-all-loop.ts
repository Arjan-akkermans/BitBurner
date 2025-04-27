import { getAllServers } from './utils'
import { getEarliestFactionWithUnique } from './workForFaction'
import { getAugmentsUnilUnique, getRepCost } from './checkBuyAndInstallAugments';
let ramFreeHome = 0;
// first argument rep/favor target
// second argument ram to keep free at home
export async function main(ns: NS) {


  const faction = getEarliestFactionWithUnique(ns);

  if (faction) {
    let targetFavor = getFavorThreshold(ns, faction);
    let targetRep = getHighestAugmentRep(ns, faction);

    if (ns.args.length > 0) {
      targetRep = ns.args[0] as number;
    }
    if (ns.args.length > 1) {
      targetFavor = ns.args[1] as number;
    }
    if (ns.args.length > 2) {
      ramFreeHome = ns.args[1] as number;
    }
    ns.tprint('share all for ', faction, ' till rep: ', targetRep, ' favor: ', targetFavor);
    await shareRamUntill(ns, faction, targetRep, targetFavor);

  }
}


export async function shareRamUntill(ns: NS, faction: string, targetRep?: number, targetFavor?: number,) {
  ns.singularity.workForFaction(faction, ns.enums.FactionWorkType.hacking);
  if (!targetRep && !targetFavor) {
    return;
  }
  let pids = [] as number[];

  // start share loop on all servers
  const cost = ns.getScriptRam('scripts/share-ram-loop.ts');
  const allServers = [...getAllServers(ns)];

  for (let i = 0; i < allServers.length; i++) {
    const server = allServers[i]
    if (!server.startsWith('hacknet')) {
      if (server !== 'home') {
        ns.killall(server);
      }
      ns.scp('scripts/share-ram-loop.ts', server);
      let ramToKeepFree = server === 'home' ? ramFreeHome : 0;
      const threads = Math.floor((ns.getServerMaxRam(server) - ramToKeepFree - ns.getServerUsedRam(server)) / cost);
      if (threads === 0) {
        continue;
      }
      const pid = ns.exec('scripts/share-ram-loop.ts', server, threads);
      pids.push(pid);
    }
  }

  while ((!targetRep || (ns.singularity.getFactionRep(faction) <= targetRep))
    && (!targetFavor || (ns.singularity.getFactionFavor(faction) + ns.singularity.getFactionFavorGain(faction) <= targetFavor))) {
    await ns.sleep(10000)
  }

  for (let i = 0; i < pids.length; i++) {
    ns.kill(pids[i]);
  }

}


export function getHighestAugmentRep(ns: NS, faction: string) {
  let augments = ns.singularity.getAugmentationsFromFaction(faction);
  let ownedAugments = ns.singularity.getOwnedAugmentations(true);
  let highestRep = 0;
  let augmentsUntillUnique = getAugmentsUnilUnique(ns, faction);
  if (augmentsUntillUnique.length > 0) {
    augments = augmentsUntillUnique
  }
  for (let i = 0; i < augments.length; i++) {
    if (augments[i] !== 'NeuroFlux Governor' && ownedAugments.every((ownedAugment) => ownedAugment !== augments[i])) {
      highestRep = Math.max(highestRep, ns.singularity.getAugmentationRepReq(augments[i]));
    }
  }
  return highestRep;

}

export function getFavorThreshold(ns: NS, faction: string) {
  const favorToDonate = ns.getFavorToDonate();

  let targetFavor = favorToDonate;
  const favorThresholds = 50;

  // if targot favor is 'way higher' then already install before because it is expected that is faster because of the increasaed rep gain
  targetFavor = Math.min(targetFavor, ns.singularity.getFactionFavor(faction) + favorThresholds);

  // but if this thresholds gets us very close just get to the donation point...
  if ((targetFavor + favorThresholds / 3) > favorToDonate) {
    targetFavor = favorToDonate;
  }

  return targetFavor;
}