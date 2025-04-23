import { infectServer } from './utils'
import { getAllServers } from './utils'
import { resetGlobals } from './autoPlay';
import { resetStocks } from './stock';
let file = 'data/globals.json';

export async function main(ns: NS) {
  let globals = JSON.parse(ns.read(file)) as Globals
  const server = 'w0r1d_d43m0n';
  if (ns.singularity.getOwnedAugmentations().includes('The Red Pill')) {

    // train hack untill high enough
    await trainHackLoop(ns);
    // didnt work before the sleep??
    await ns.sleep(100);
    infectServer(ns, ns.getServer(server));
    await ns.sleep(100);
    if (ns.hasRootAccess(server)) {
      ns.write('data/log.buyAugments.txt', (new Date().getTime) + ' ending bitnode / n', 'a')

      resetGlobals(ns);
      resetStocks(ns);
      ns.write(file, JSON.stringify(globals), 'w');
      ns.singularity.destroyW0r1dD43m0n(12, 'scripts/autoPlay.ts');
    }
  }

}



export async function trainHackLoop(ns: NS) {
  const server = 'w0r1d_d43m0n';
  if (ns.getHackingLevel() < ns.getServerRequiredHackingLevel(server)) {
    const allServers = getAllServers(ns);
    const costWeak = ns.getScriptRam('scripts/weaken-single.ts')
    const costHack = ns.getScriptRam('scripts/hack-single.ts')
    const costGrow = ns.getScriptRam('scripts/grow-single.ts')

    allServers.forEach((
      server
    ) => {
      const s = ns.getServer(server);
      if (s.hostname !== 'home') {
        ns.killall();
      }
      ns.scp('scripts/weaken-single.ts', server);
      ns.scp('scripts/grow-single.ts', server);
      ns.scp('scripts/hack-single.ts', server);
    })

    const serverToHack = 'joesguns'

    while (ns.getHackingLevel() < ns.getServerRequiredHackingLevel(server)) {
      let cost = 1.75;
      let script = ''
      if (ns.getServerSecurityLevel(serverToHack) > ns.getServerMinSecurityLevel(serverToHack)) {
        script = 'scripts/weaken-single.ts';
        cost = costWeak;
      }
      else {
        script = 'scripts/grow-single.ts';
        cost = costGrow;
      }
      allServers.forEach((server) => {
        let threads = Math.floor((ns.getServerMaxRam(server) - ns.getServerUsedRam(server)) / cost);
        if (threads === 0) {
          return;
        }
        ns.exec(script, server, threads, serverToHack)
      })
      await ns.sleep(100)
    }
  }
}