export async function main(ns: NS) {


  while (true) {
    ns.getPurchasedServers().forEach((server) => {
      const ramAvailable = ns.getServerMaxRam(server) - ns.getServerUsedRam(server)
      const scriptRamCost = 4;
      if (ramAvailable > scriptRamCost) // hardcoded usage of ram script
      {
        ns.scp('scripts/share-ram-loop.ts', server);
        ns.exec('scripts/share-ram-loop.ts', server, Math.floor(ramAvailable / scriptRamCost))
      }

    })
    await (ns.sleep(1000));
  }
}

