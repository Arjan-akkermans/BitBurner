import { getAllServers } from './utils'

export async function main(ns: NS) {

  await trainHackLoop(ns, ns.args[0] as number, (ns.args[1] ?? 0) as number);

}

export async function trainHackLoop(ns: NS, limit: number, ramToKeepFreeHome: number) {
  const allServers = getAllServers(ns);
  const costWeak = ns.getScriptRam('scripts/weaken-single.ts')
  const costHack = ns.getScriptRam('scripts/hack-single.ts')
  const costGrow = ns.getScriptRam('scripts/grow-single.ts')

  allServers.forEach((
    server
  ) => {
    const s = ns.getServer(server);
    if (s.hostname !== 'home') {
      ns.killall(s.hostname);
    }
    ns.scp('scripts/weaken-single.ts', server);
    ns.scp('scripts/grow-single.ts', server);
    ns.scp('scripts/hack-single.ts', server);
  })

  let serverToHack = 'joesguns'

  if (!ns.hasRootAccess(serverToHack)) {
    serverToHack = 'n00dles';
    limit = ns.getHackingLevel() + 1;
  } 

  while (ns.getHackingLevel() < limit) {
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
      if (!server.startsWith('hacknet')) {
        let ramToKeepFree = server === 'home' ? ramToKeepFreeHome : 0
        let threads = Math.floor((ns.getServerMaxRam(server) - ramToKeepFree - ns.getServerUsedRam(server)) / cost);
        if (threads <= 0) {
          return;
        }
        ns.exec(script, server, threads, serverToHack)
      }
    })
    await ns.sleep(100)
  }
}