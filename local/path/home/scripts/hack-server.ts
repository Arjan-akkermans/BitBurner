/** @param {NS} ns
 * @param  the ip of the server to hack
 */
export async function main(ns: NS) {
  let serverToHack = '';
  if (ns.args.length > 0) {
    serverToHack = ns.args[0] as string;
  }
  else {
    const constants = JSON.parse(ns.read('data/constants.json'));
    const serverToHack = constants.serverToHack.hostname;
  }
  const currentHostName = ns.getHostname();
  // Defines how much money a server should have before we hack it
  // In this case, it is set to the maximum amount of money.
  const moneyThresh = ns.getServerMaxMoney(serverToHack) * 0.80;

  // Defines the minimum security level the target server can
  // have. If the target's security level is higher than this,
  // we'll weaken it before doing anything else
  const securityThresh = ns.getServerMinSecurityLevel(serverToHack) * 1.05;

  const hackingThreshold = 5; //???

  // Infinite loop that continously hacks/grows/weakens the target server
  while (true) {
    const start = new Date().getTime();
    let log = '';
    let hacked = false;
    if (ns.getServerSecurityLevel(serverToHack) > securityThresh) {
      const weakened = (await ns.weaken(serverToHack));
      log = 'weakened ' + weakened;
    } else if (ns.getServerMoneyAvailable(serverToHack) < moneyThresh) {

      const grew = (await ns.grow(serverToHack));
      log = 'grew ' + grew;
    } else {
      const numberCurrentlyHacking = ns.ls('home', 'data/hacking-servers').length - 1;
      if (numberCurrentlyHacking < hackingThreshold) {

        hacked = true;
        const stolen = (await ns.hack(serverToHack));
        log = 'stole ' + stolen;
      }
      else {

        await ns.sleep(10000)
        log = 'waited 10 sec';
      }
    }
    const end = new Date().getTime();
    ns.exec('scripts/update-hacking-json.ts', 'home', 1, hacked, currentHostName, log);
  }
}