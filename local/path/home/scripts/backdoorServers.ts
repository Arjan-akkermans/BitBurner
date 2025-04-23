import { getAllServers, getShortestPath } from './utils'
import { getEarliestFactionWithUnique } from './workForFaction';
export async function main(ns: NS) {
  const servers = [...getAllServers(ns)];
  await backdoorServers(ns, servers);
}

// TODO FOR NOW ONLY HACK Faction servers
export const backdoorServers = async (ns: NS, servers: string[]) => {
  let location = ns.getHostname();
  for (let i = 0; i < servers.length; i++) {
    let target = servers[i];
    let server = ns.getServer(target);
    if (target !== 'home' && target !== 'w0r1d_d43m0n' && !server.purchasedByPlayer && ns.hasRootAccess(target) && !server.backdoorInstalled
      && (["avmnite-02h", "CSEC", "I.I.I.I", "run4theh111z"].includes(target))) {
      connect(ns, location, target);
      ns.print('backdooring ', target);
      await ns.singularity.installBackdoor();
      location = target;
    }

  }

}

export const connect = (ns: NS, source: string, target: string) => {

  const path = getShortestPath(ns, source, target);
  if (!path) { return };
  for (let j = 0; j < path.length; j++) {

    ns.singularity.connect(path[j]);
  }
  // shortest path does not include the instance itself
  ns.singularity.connect(target);

}