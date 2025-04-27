import { getAllPersonalServers } from './utils'
import { getEarliestFactionWithUnique } from './workForFaction'
import { getAugmentsUnilUnique, getRepCost } from './checkBuyAndInstallAugments';
let ramFreeHome = 0;
// script which claims a few pservers and uses all their ram to share
const pserversToClaim = 1; // sharing has very steep returns
// calculation for effective threads is 1+ Math.log(sharePower) / 25;

export async function main(ns: NS) {

    await shareRam(ns);
}


export async function shareRam(ns: NS) {

    // nothing is currently donw with this varialbe
    let pids = [] as number[];

    // start share loop on servers
    const cost = ns.getScriptRam('scripts/share-ram-loop.ts');
    const allPersonalServers = [...getAllPersonalServers(ns)];

    let assigned = 0;
    // first kill all scripts on server if share ram loop is running
    for (let i = 0; i < allPersonalServers.length; i++) {
        const server = allPersonalServers[i];
        if (ns.scriptRunning('scripts/share-ram-loop.ts', server)) {
            ns.killall(server);
        }
    }

    // assign all ram of of any personal servers untill limit is reached
    for (let i = 0; i < allPersonalServers.length; i++) {
        const server = allPersonalServers[i];
        ns.scp('scripts/share-ram-loop.ts', server);
        let ramToKeepFree = 0;
        const threads = Math.floor((ns.getServerMaxRam(server) - ramToKeepFree - ns.getServerUsedRam(server)) / cost);
        if (threads === 0) {
            continue;
        }
        const pid = ns.exec('scripts/share-ram-loop.ts', server, threads);
        assigned++;
        pids.push(pid);
        if (assigned >= pserversToClaim) {
            break;
        }
    }
}
