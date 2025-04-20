import { getServerToHack, getAllServers } from './utils'

/*
* @param serverToHack? optional parameter if included will hack that target
*/

export async function main(ns: NS) {

  // run all scripts once to compile them (ensures proper sequencing)
  ns.exec('scripts/grow-single.ts', 'home', 1, 'n00dles');
  ns.exec('scripts/hack-single.ts', 'home', 1, 'n00dles');
  ns.exec('scripts/weaken-single.ts', 'home', 1, 'n00dles');

  while (true) {
    let servers = [...getAllServers(ns)];

    for (let i = 0; i < servers.length; i++) {
      const server = servers[i];
      ns.scp('scripts/grow-single.ts', server);
      ns.scp('scripts/hack-single.ts', server);
      ns.scp('scripts/weaken-single.ts', server);
    }
    await updateBatches(ns, servers);
    await ns.sleep(1000);
  }
}

export const updateBatches = async (ns: NS, servers: string[]) => {
  let serverToHack = getServerToHack(ns);

  // hacking of specific server is done in early game to avoid switching too fast!
  if (ns.args.length > 0) {
    serverToHack = ns.args[0] as string;
  }
  // for now use that a batch is contained fully on a server
  for (let i = 0; i < servers.length; i++) {
    const server = servers[i];
    const hostName = server;

    const costWeaken = ns.getScriptRam('scripts/weaken-single.ts');
    const costGrow = ns.getScriptRam('scripts/grow-single.ts');
    const costHack = ns.getScriptRam('scripts/hack-single.ts');

    // start mew batches

    const weakenTime = ns.getWeakenTime(serverToHack);
    const hackTime = ns.getHackTime(serverToHack);
    const growTime = ns.getGrowTime(serverToHack);
    let ram = getServerRamAvailable(ns, server);

    // server is in ideal state (lowest security highest money)
    await createBatch(ns, hostName, serverToHack)
  }
}

export const createBatch = async (ns: NS, hostName: string, serverToHack: string) => {
  const maxRam = ns.getServerMaxRam(hostName);
  const ram = getServerRamAvailable(ns, hostName);
  const server = ns.getServer(serverToHack);
  // if there is little ram available, then do not bother (intended to skip servers which already are nearly fully scheduled)
  if (ram > 0.1 * maxRam) {
    const weakenTime = ns.getWeakenTime(serverToHack);
    const hackTime = ns.getHackTime(serverToHack);
    const growTime = ns.getGrowTime(serverToHack);

    const costWeaken = ns.getScriptRam('scripts/weaken-single.ts');
    const costGrow = ns.getScriptRam('scripts/grow-single.ts');
    const costHack = ns.getScriptRam('scripts/hack-single.ts');

    // batch parameters no formulas
    const ratioForHack = 25 / 26
    const ratioForWeaken = 1 / 26;

    let weaken1Threads = Math.max(Math.floor(ram / costWeaken * ratioForWeaken), 1);
    let hackThreads = Math.max(Math.floor((ram - weaken1Threads * costWeaken) / costHack), 1);

    const hackpid = ns.exec('scripts/hack-single.ts', hostName, hackThreads, serverToHack, weakenTime - hackTime);
    const weaken1pid = ns.exec('scripts/weaken-single.ts', hostName, weaken1Threads, serverToHack,);

  }
}



export const getServerRamAvailable = (ns: NS, server: string) => {
  let ram = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
  if (server === 'home' && ram > 100) {
    ram -= 50; // keep some ram free on home to run other scripts,
    // but only if plenty is available because in early game all is needed
  }
  return ram;
}
