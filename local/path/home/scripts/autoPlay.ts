let file = 'data/globals.json';
let globals = {} as Globals;
export async function main(ns: NS) {
  globals = JSON.parse(ns.read(file))
  globals.activityType = undefined;
  globals.factionToWorkFor = '';
  globals.trainHack = false;
  ns.write('data/globals.json', JSON.stringify(globals), 'w');

  ns.run('scripts/hackn00dles.ts');
  const port = ns.getPortHandle(1);
  await port.nextWrite();
  let moneySpend = 0;
  let counter = 0;
  let start = new Date().getTime();
  let serverToHack = '';
  let hardCodedServer = undefined as undefined | string;
  // just some logic to be able to skip early iterations manually!
  if (ns.args.length > 0) {
    hardCodedServer = ns.args[0] as string;
  }

  //await run(ns, 'scripts/stock.ts');

  while (true) {
    await run(ns, 'scripts/manageGang.ts', undefined, true);
    await run(ns, 'scripts/IPvGO.ts', undefined, true);
    await run(ns, 'scripts/updateHUD.ts', undefined, true);

    counter++;
    // as start activity train skills and then do crime!
    await run(ns, 'scripts/sleeves.ts');
    await run(ns, 'scripts/chooseActivity.ts');
    globals = JSON.parse(ns.read(file))
    if (ns.getServerMaxRam('home') - ns.getServerUsedRam('home') >= 24) {
      await run(ns, 'scripts/spendHashes.ts')
      await run(ns, 'scripts/search-cct.ts')
    }

    globals = JSON.parse(ns.read(file))
    let shareRam = globals.activityType === 'FACTION'
    if (shareRam) {
      await run(ns, 'scripts/share-part-ram.ts');
    }

    let trainHack = globals.trainHack;
    if (trainHack) {
      await run(ns, 'scripts/train-hack-loop.ts');
    }
    else {
      let pid = await run(ns, 'scripts/batch-manager-loop.ts', [hardCodedServer ? hardCodedServer : serverToHack, true, counter === 1])
      globals = JSON.parse(ns.read(file))
      let dataRead = undefined;
      if (pid) {
        dataRead = ns.readPort(pid) as { serverToHack: string, moneyStolen: number };
      }
      if (dataRead) {
        serverToHack = dataRead.serverToHack;
        let moneyStolen = dataRead.moneyStolen;
        if (moneyStolen > 0) {
          // if not a HWG batch then money is 0, so we do not want to have that information, the older non zero value is more relevant
          globals.lastBatchMoneyGain = moneyStolen;
        }
        ns.write('data/globals.json', JSON.stringify(globals), 'w');
        if (serverToHack = 'NULL PORT DATA') {
          serverToHack = '';
        }
      }

    }

    if (ns.getServerMaxRam('home') <= 256) {
      await run(ns, 'scripts/upgradeHomeRam.ts');
    }
    await run(ns, 'scripts/acceptFactionInvitation.ts');

    await run(ns, 'scripts/infectServers.ts');

    globals = JSON.parse(ns.read(file));
    if (!globals.skip) {
      await run(ns, 'scripts/purchasePrograms.ts');
      await run(ns, 'scripts/upgrade-servers.ts');
      moneySpend += ns.readPort(3);
      await run(ns, 'scripts/upgradeStartHacknet.ts')
      //await run(ns, 'scripts/upgrade-hacknet.ts');
      moneySpend += ns.readPort(3);
    }
    // if enough money is made set serverToHack to undefined such that batch manager calculates it again
    if (serverToHack !== '' && ns.getServerMoneyAvailable('home') > (10 * ns.getServerMaxMoney(serverToHack) - moneySpend)) {
      serverToHack = '';
      moneySpend = 0;
    }
    // backdooring happens async as it can take some time, therefore check if its already running
    // backdooring only happens if some RAM is available on home, otherwise RAM is better spend upgrading
    if (!ns.getRunningScript('scripts/backdoorServers.ts', 'home') && ns.getServerMaxRam('home') >= 128) {
      ns.run('scripts/backdoorServers.ts');
    }

    // only work for faction if skills are somewhat trained and home has ram!
    await run(ns, 'scripts/checkBuyAndInstallAugments.ts')
    globals = JSON.parse(ns.read(file))
  }
}

/*

*/
/**
 *
 *
 * @param scriptName
 * @param {ScriptArg[]} [args]
 * @param  [scriptRunsItselfAgain=false] if TRUE then the called script will run itself hence check if its already running, and do not wait on it to finish
 * @return after the script has ended. if checkAlreadyRunning is true, then the  
 */
export async function run(ns: NS, scriptName: string, args?: ScriptArg[], scriptRunsItselfAgain = false) {
  if (ns.getServerMaxRam('home') - ns.getServerUsedRam('home') < ns.getScriptRam(scriptName)) {
    return
  }
  if (scriptRunsItselfAgain && ns.isRunning(scriptName)) {
    return
  }

  const pid = ns.run(scriptName, 1, ...(args ?? []));
  if (scriptRunsItselfAgain) {
    // give control to the script, this way if the script terminates the RAM is freed
    await ns.sleep(0);
    return pid;
  }
  while (ns.isRunning(pid)) {
    await ns.sleep(100)
  }
  return pid;
}


export function resetGlobals(ns: NS) {
  let globals = JSON.parse(ns.read(file));

  globals.skip = false;
  globals.shareRam = false;
  globals.activityType = undefined;
  globals.trainHack = false;
  globals.reset = false;
  globals.lastBatchMoneyGain = 0;
  globals.factionToWorkFor = '';
  globals.trainingTime = undefined;
  globals.trainForCombatFactions = false; // there currently is no logic to set this to TRUE, has to be done manually
  ns.write('data/globals.json', JSON.stringify(globals), 'w');
}