
let file = 'data/globals.json';


export async function main(ns: NS) {

  let globals = JSON.parse(ns.read(file)) as Globals
  await run(ns, 'scripts/acceptFactionInvitation.ts');

  await run(ns, 'scripts/infectServers.ts');

  let moneySpend = 0;
  if (!globals.skip) {
    await run(ns, 'scripts/purchasePrograms.ts');
    await run(ns, 'scripts/upgrade-servers.ts');
    moneySpend = ns.readPort(3);
  }

  // backdooring happens async as it can take some time, therefore check if its already running
  // backdooring only happens if some RAM is available on home, otherwise RAM is better spend upgrading
  if (!ns.getRunningScript('scripts/backdoorServers.ts', 'home') && ns.getServerMaxRam('home') >= 128) {
    ns.run('scripts/backdoorServers.ts');
  }

  // give control back to batch manager loop
  ns.writePort(2, moneySpend);

}
/*
* runs a script, returns a promise which ends if the script ended
*/
export async function run(ns: NS, scriptName: string) {
  const pid = ns.run(scriptName);
  while (ns.isRunning(pid)) {
    await ns.sleep(100)
  }
  return;
}