export async function main(ns: NS) {

  // clear existing output
  ns.rm('data/analysis/server-analyze.txt');

  const constants = JSON.parse(ns.read('data/constants.json'));
  const serverToHack = constants.serverToHack.hostname;
  let i = 1;
  while (true) {
    // format [i,Security,Growth];
    const data = '[' + i + ',' + ns.getServerSecurityLevel(serverToHack) + ',' + ns.getServerMoneyAvailable(serverToHack) + ']';
    ns.write('data/analysis/server-analyze.txt', data + '\n', "a");
    i++;
    await ns.sleep(1000);
  }

}