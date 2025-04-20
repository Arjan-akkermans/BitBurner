import { infectServer, getAllServers } from './utils'

export async function main(ns: NS) {


  infectServers(ns, [...getAllServers(ns)]);

}

export const infectServers = (ns: NS, servers: string[]) => {
  for (let i = 0; i < servers.length; i++) {
    if (!ns.hasRootAccess(servers[i])) {
      infectServer(ns, ns.getServer(servers[i]))
    }
  }
}