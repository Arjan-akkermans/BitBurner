/** @param {NS} ns
 * @param startingRam number
 */


export async function main(ns: NS) {
  const moneySpend = upgradeServers(ns);
  ns.writePort(3, moneySpend);


}

export const upgradeServers = (ns: NS) => {

  let moneySpend = 0;

  const purchaseServer = (id: string, ramSize: number) => {
    return ns.purchaseServer(id, ramSize);
  }


  // Part 1, create servers untill limit
  // start with ram of any existing server if that exists, otherwise take this hardoded value
  let servers = ns.getPurchasedServers();
  let finished = false;
  let currentRam = 8;
  let count = 0;
  // if there is money to buy all 25 servers already, then skip a step
  while (((ns.getPurchasedServerCost(currentRam) * 25) < ns.getServerMoneyAvailable("home")) && (currentRam < ns.getPurchasedServerMaxRam()) && count < 100) {
    count++;
    currentRam = Math.min(currentRam * 2, ns.getPurchasedServerMaxRam());
  }


  if (ns.args.length > 0) {
    currentRam = ns.args[0] as number
  }
  if (servers.length > 0) {
    currentRam = Math.max(...servers.map((server) => ns.getServerMaxRam(server)))
  }

  if (currentRam === ns.getPurchasedServerMaxRam()) {
    finished = true;
  }

  if (ns.getPurchasedServerLimit() === 0) {
    finished = true;
  }

  let i = servers.length;
  // Continuously try to purchase servers until we've reached the maximum
  // amount of servers
  while (i < ns.getPurchasedServerLimit() && !finished) {
    // Check if we have enough money to purchase a server
    if (ns.getServerMoneyAvailable("home") > ns.getPurchasedServerCost(currentRam)) {
      ns.tprint('buying server', 'pserv-' + i, ' with ', currentRam, ' ram');
      const hostName = purchaseServer('pserv-' + i, currentRam)
      i++;
      moneySpend += ns.getPurchasedServerCost(currentRam);
    }
    else {
      finished = true;
      break;
    }
  }


  while (!finished) {
    const currentServers = ns.getPurchasedServers();
    for (i = 0; i < currentServers.length; i++) {
      const server = currentServers[i];
      // sanity checks to avoid removing server
      if (server && ns.getServerMaxRam(server) < currentRam) {
        let upgraded = false;
        while (!upgraded) {
          if (ns.getServerMoneyAvailable("home") > ns.getPurchasedServerCost(currentRam)) {

            ns.tprint('upgrading server', server, ' to ', currentRam);
            ns.killall(server);
            ns.upgradePurchasedServer(server, currentRam);
            moneySpend += ns.getPurchasedServerCost(currentRam);
            upgraded = true;
          }
          else {
            finished = true;
            break
          }
        }
      }
    }
    // all servers upgraded, increased RAM and continue;
    servers = ns.getPurchasedServers();
    currentRam *= 2;
    let count = 0;
    // if there is money to buy all 25 servers already, then skip a step
    while (((ns.getPurchasedServerCost(currentRam) * 25) < ns.getServerMoneyAvailable("home")) && (currentRam < ns.getPurchasedServerMaxRam()) && count < 100) {
      count++;
      currentRam = Math.min(currentRam * 2, ns.getPurchasedServerMaxRam());
    }
  }

  return moneySpend;
}
