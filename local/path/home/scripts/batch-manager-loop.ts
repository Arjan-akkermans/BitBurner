import { getServerToHack, getAllServers, getHGWThreads, getHGWThreadsFromHackThread } from './utils'
let file = 'data/globals.json';
let globals = {} as Globals;
interface Batch {
  start: number, // number miliseconds after UTC that the batch starts (including possible SleepAtStart start weaken 1)
  end: number, // number miliseconds after UTC that the batch (last action) ends
  type: string; // Type of batch (letters for operations)
  serverToHack: string;
}

interface BatchW extends Batch {
  type: 'W',
  weaken1pid: number;
  weaken1Host: string;
  weaken1Threads: number;
}
interface BatchGW extends Omit<BatchW, 'type'> {
  type: 'GW',
  growpid: number;
  growHost: string;
  growThreads: number;
}
interface BatchHW extends Omit<BatchW, 'type'> {
  type: 'HW',
  hackpid: number;
  hackHost: string;
  hackThreads: number;
}
interface BatchHGW extends Omit<BatchHW, 'type'> {
  type: 'HGW',
  growpid: number;
  growHost: string;
  growThreads: number;
}
interface BatchHWGW extends Omit<BatchGW, 'type'> {
  type: 'HWGW',
  hackpid: number,
  hackHost: string,
  hackThreads: number,
  weaken2pid: number,
  weaken2Host: string,
  weaken2Threads: number
  growpid: number,
}
function isBatchW(batch: BatchW | BatchGW | BatchHWGW): batch is BatchW {
  return batch.type === 'W'
}
function isBatchGW(batch: BatchW | BatchGW | BatchHWGW): batch is BatchGW {
  return batch.type === 'GW'
}
function isBatchHWG(batch: BatchW | BatchGW | BatchHGW | BatchHWGW): batch is BatchHGW {
  return batch.type === 'HGW'
}
function isBatchHWGW(batch: BatchW | BatchGW | BatchHWGW): batch is BatchHWGW {
  return batch.type === 'HWGW'
}




/*
* contains sorted list of batches, sorted by end time ascendingly
*/
let activeBatches = [] as (BatchW | BatchGW | BatchHGW | BatchHWGW)[];

/*
* @param serverToHack? optional parameter if included will hack that target
* @param runOnce? optional parameter to only run 1 iteration
* @param doWarmup optional to run the scripts once on n00dles
* @param isLong optional boolean or undefined to indicate whether the hack is done based on a long (true) or short (false) stock
*/



// TODO properly schedule Weaken and grow and then start with batching,
// currently if server is not ideal we spend a full iteration doing only preperation
export async function main(ns: NS) {
  if (ns.hasRootAccess('n00dles') && (ns.args.length < 2 || (ns.args[2] as boolean))) {
    // run all scripts once to compile them (ensures proper sequencing)
    ns.exec('scripts/grow-single.ts', 'home', 1, 'n00dles');
    ns.exec('scripts/hack-single.ts', 'home', 1, 'n00dles');
    ns.exec('scripts/weaken-single.ts', 'home', 1, 'n00dles');
  }
  let isLong = undefined;
  if (ns.args.length > 3) {
    isLong = ns.args[3] as boolean;
  }
  let moneyStolen = 0;
  let moneyBeforeContinue = ns.getServerMoneyAvailable('home');
  // if argument is provided for serer to hack, use it
  // if the argument is undefined then determine the server and write as output to port
  // if no argument is provided then determine itself
  let currentServerToHack = getServerToHack(ns);

  if (ns.args.length > 0) {

    currentServerToHack = ns.args[0] as string;
  }
  if (currentServerToHack === '') {

    currentServerToHack = getServerToHack(ns) as string;
  }

  let runOnce = false;
  if (ns.args.length > 1) {
    runOnce = ns.args[1] as boolean;
  }
  let keepGoing = true;
  while (true && keepGoing) {
    activeBatches = [];

    if (ns.hasRootAccess(currentServerToHack)) {

      let servers = [...getAllServers(ns)];
      // sort servers in ascending order only those with root access
      servers = servers.filter((server) => ns.hasRootAccess(server) && !server.startsWith('hacknet'));
      servers = servers.sort((a, b) => ns.getServerMaxRam(a) - ns.getServerMaxRam(b));

      for (let i = 0; i < servers.length; i++) {
        const server = servers[i];
        ns.scp('scripts/grow-single.ts', server);
        ns.scp('scripts/hack-single.ts', server);
        ns.scp('scripts/weaken-single.ts', server);
      }
      ns.tprint('keeping 100 free ram on home!')
      const freeRamForHome = 100;
      let serversObject = servers.map((server) => {
        let serverFull = ns.getServer(server);
        return { hostName: server, availableRAM: ns.getServerMaxRam(server) - ns.getServerUsedRam(server) - (server === 'home' ? freeRamForHome : 0), cpuCores: serverFull.cpuCores }
      })
      //ns.tprint( serversObject);

      moneyStolen = await updateBatches(ns, serversObject, currentServerToHack, isLong);
      // add a small sleep, otherwise ram is not always freed
      writeServerState(ns, currentServerToHack)
    }
    if (runOnce) {
      break;
    }
    // only update server to hack after some money is earned. This is inteded to be used in early game
    // to ensure some hacking is done after growing/weakening a server.
    if (ns.getServerMoneyAvailable('home') > (10 * ns.getServerMaxMoney(currentServerToHack) + moneyBeforeContinue)) {
      currentServerToHack = getServerToHack(ns)
    }

    // upgrade stuff, wait for script to finish before continuing
    if (ns.getServerMaxRam('home') - ns.getServerUsedRam('home') >= ns.getScriptRam('scripts/upgrade.ts')) {
      ns.exec('scripts/upgrade.ts', 'home')

      await ns.nextPortWrite(2);

      // upgrade script writes how much money is spend, we use this to update the threshold to switch targets
      // indicating that we want to switch after a certain amount of money is spend, and not currently available
      moneyBeforeContinue -= ns.readPort(2);
    }
    // if input provided only do one loop!
    keepGoing = !runOnce;
  }

  let objectToWrite = { currentServerToHack, moneyStolen }
  ns.writePort(ns.pid, objectToWrite);

  globals = JSON.parse(ns.read(file))
  ns.write(file, JSON.stringify(globals), 'w')

}

export const updateBatches = async (ns: NS, servers: { hostName: string, availableRAM: number, cpuCores: number }[], serverToHack: string, isLong: boolean | undefined) => {

  let moneyHacked = 0;
  const costWeaken = ns.getScriptRam('scripts/weaken-single.ts');
  const costGrow = ns.getScriptRam('scripts/grow-single.ts');
  const costHack = ns.getScriptRam('scripts/hack-single.ts');

  const weakenTime = ns.getWeakenTime(serverToHack);
  const hackTime = ns.getHackTime(serverToHack);
  const growTime = ns.getGrowTime(serverToHack);


  // if needed, schedule batches to lower security
  // just assign as much as possible, as we cannot determine when to schedule after (without formulas)
  if (ns.getServerSecurityLevel(serverToHack) > ns.getServerMinSecurityLevel(serverToHack)) {
    const numberOfThreadsNeeded = (ns.getServerSecurityLevel(serverToHack) - ns.getServerMinSecurityLevel(serverToHack)) / 0.05;
    let numberOfThreadsAssigned = 0;
    for (let i = 0; i < servers.length; i++) {
      const server = servers[i];
      const threads = Math.floor((ns.getServerMaxRam(server.hostName) - ns.getServerUsedRam(server.hostName)) / costWeaken);
      if (threads > 0) {
        numberOfThreadsAssigned += threads;
        ns.exec('scripts/weaken-single.ts', server.hostName, threads, serverToHack, 0);
      }
      /*if (numberOfThreadsAssigned >= numberOfThreadsNeeded) {
        break;
      }
      else {
        if (i === servers.length - 1) {
          isRamExhausted = true;
        }
      }*/
    }
    await ns.sleep(weakenTime);
    return moneyHacked;
  }
  // else grow money to max if not already there
  else if (ns.getServerMaxMoney(serverToHack) > ns.getServerMoneyAvailable(serverToHack)) {

    for (let i = 0; i < servers.length; i++) {
      const server = servers[i];
      const ramAvailable = (ns.getServerMaxRam(server.hostName) - ns.getServerUsedRam(server.hostName));
      // logic below works as costGrow and costWeaken are the same
      let growThreads = Math.max(Math.floor(ramAvailable * 12.5 / 13.5 / costGrow), 1);
      let weakenThreads = Math.max(Math.ceil(growThreads / 12.5), 1);

      // to avoid taking up too much ram because of ram errors try to reduce growthreads by 1 if too much
      if (growThreads * costGrow + weakenThreads * costWeaken > ramAvailable) {
        growThreads = Math.max(growThreads - 1, 1);
        weakenThreads = Math.max(Math.ceil(growThreads / 12.5), 1);
      }
      // as both threads are limited to 1 minimum, verify that there is ram
      if (growThreads * costWeaken + weakenThreads * costGrow <= ramAvailable)
        ns.exec('scripts/grow-single.ts', server.hostName, growThreads, serverToHack, weakenTime - growTime, isLong ?? false)
      ns.exec('scripts/weaken-single.ts', server.hostName, weakenThreads, serverToHack, 0);
    }
    await ns.sleep(weakenTime);
    return moneyHacked;
  }

  else {
    // server is in ideal state (lowest security highest money)
    moneyHacked = await createHGWBatch(ns, servers, serverToHack, isLong);

    //writeBatches(ns);
    // wait till last script is completed
    let pidtoWaitOn = ((activeBatches[activeBatches.length - 1]) as BatchHGW)?.weaken1pid;
    let counterUpdateHud = 0
    while (pidtoWaitOn && ns.isRunning(pidtoWaitOn)) {
      // TODO more generic solution for updateHUD?
      counterUpdateHud++;
      if (counterUpdateHud === 10) {
        updateHUD(ns, moneyHacked);
        counterUpdateHud = 0;
      }
      await ns.sleep(100);
    }
    checkServerState(ns, serverToHack, true);
    return moneyHacked;
  }
}


export const createHGWBatch = async (ns: NS, servers: { hostName: string, availableRAM: number, cpuCores: number }[], serverToHack: string, isLong: boolean | undefined) => {
  // initialize with assigning a batch with hack threads enough to hack all funds
  // but if the last server (has most ram available) cannot fit that then we can start lower
  let player = ns.getPlayer();
  let server = ns.getServer(serverToHack);
  let moneyStolenSingle = ns.hackAnalyze(serverToHack) * ns.getServerMaxMoney(serverToHack);
  let xpFromThread = ns.formulas.hacking.hackExp(server, player);
  const weakenTime = ns.getWeakenTime(serverToHack);
  const hackTime = ns.getHackTime(serverToHack);
  const growTime = ns.getGrowTime(serverToHack);

  const costWeaken = ns.getScriptRam('scripts/weaken-single.ts');
  const costGrow = ns.getScriptRam('scripts/grow-single.ts');
  const costHack = ns.getScriptRam('scripts/hack-single.ts');

  let count = 0;
  // get player object, and update throughout while loop to account for later batches!

  let maxLoop = 1000000;
  // sort ascending number of cores
  servers.sort((a, b) => a.cpuCores - b.cpuCores);
  // start with most optimal, then decrease (expected if no space to fit batch)
  let maxCores = servers[servers.length - 1].cpuCores;
  let threads = getHGWThreads(ns, server, maxCores, player);
  let hackThreads = threads.hackThreads;
  let recalculateThreads = false;
  // keep per core (for grow) the optimal number of threads available
  // this will start off with the optimal number of hack threads, given that max cpu cores are available
  // then hackingThreads will be lowered (assuming that is only needed if there is not sufficient RAM)
  // note its not totally optimal, as different cores might lead to different optimal threads, but this should be relatively close to optimal
  let threadsPerCore = new Map<number, {
    hackThreads: number;
    growThreads: number;
    weakenThreads: number;
  }>;

  while (hackThreads >= 1 && count < maxLoop) {
    count++;
    if (recalculateThreads) {
      for (let i = 1; i <= maxCores; i++) {
        threadsPerCore.set(i, getHGWThreadsFromHackThread(ns, ns.getServer(serverToHack), i, hackThreads, player))
      }
      recalculateThreads = false;
    }
    let hackpid = undefined as number | undefined
    let weakenpid = undefined as number | undefined
    let growpid = undefined as number | undefined
    let hackHost = undefined as string | undefined
    let weakenHost = undefined as string | undefined
    let growHost = undefined as string | undefined
    let growThreadsLoop = 0;
    let hackThreadsLoop = 0;
    let weakenThreadsLoop = 0;
    let growCores = 0;
    // servers start in ascending order of available ram, always try assigning from begin

    // try assign all 3 actions
    // assign grow
    // start from end i.e. server with most cores
    for (let i = servers.length - 1; i >= 0; i--) {
      let serverObject = servers[i];
      let growThreadsLocal = threadsPerCore.get(serverObject.cpuCores)?.growThreads as number;
      if (serverObject.availableRAM >= costGrow * growThreadsLocal) {
        serverObject.availableRAM -= costGrow * growThreadsLocal;
        growHost = serverObject.hostName;
        growThreadsLoop = growThreadsLocal;
        growCores = serverObject.cpuCores;
        break;
      }
    }
    // assign hack
    for (let i = 0; i < servers.length; i++) {
      let serverObject = servers[i];
      let hackThreadsLocal = threadsPerCore.get(growCores)?.hackThreads as number;
      if (serverObject.availableRAM >= costHack * hackThreadsLocal
      ) {
        serverObject.availableRAM -= costHack * hackThreadsLocal;
        hackHost = serverObject.hostName;
        hackThreadsLoop = hackThreadsLocal;
        break;
      }
    }
    // assign hack
    for (let i = 0; i < servers.length; i++) {
      let serverObject = servers[i];
      let weakenThreadsLocal = threadsPerCore.get(growCores)?.weakenThreads as number;
      if (serverObject.availableRAM >= costWeaken * weakenThreadsLocal
      ) {
        serverObject.availableRAM -= costWeaken * weakenThreadsLocal;
        weakenHost = serverObject.hostName;
        weakenThreadsLoop = weakenThreadsLocal;
        break;
      }
    }

    // if batch is scheduled, store it, increase XP and go to next
    // ideally, xp gained should also be accounted for within a batch TODO
    if (hackHost && growHost && weakenHost) {
      hackpid = ns.exec('scripts/hack-single.ts', hackHost, hackThreadsLoop, serverToHack, weakenTime - hackTime, !isLong);
      growpid = ns.exec('scripts/grow-single.ts', growHost, growThreadsLoop, serverToHack, weakenTime - growTime, isLong ?? false);
      weakenpid = ns.exec('scripts/weaken-single.ts', weakenHost, weakenThreadsLoop, serverToHack, 0);
      let xpGained = xpFromThread * (hackThreadsLoop + growThreadsLoop + weakenThreadsLoop);
      let hackingBefore = player.skills.hacking;
      player.exp.hacking += xpGained;
      player.skills.hacking = ns.formulas.skills.calculateSkill(player.exp.hacking, player.mults.hacking);
      if (hackingBefore < player.skills.hacking) {
        // recalculate thread distribution after skill will change!
        recalculateThreads = true;
      }
      // push succesfully scheduled batch to array, and try assignment again (with same threads)
      const start = new Date().getTime();
      const end = start + weakenTime
      const type = 'HGW';
      // batch is always scheduled as last!
      activeBatches.push({
        start, end, type, weaken1pid: weakenpid, weaken1Host: weakenHost, growpid, growHost, hackpid, hackHost, weaken1Threads: weakenThreadsLoop, growThreads: growThreadsLoop, hackThreads: hackThreadsLoop, serverToHack
      })
    }
    else {
      // if batch could not be scheduled (must be because of no RAM)
      // reset changes done in loop (= modified available ram)
      // and reduce hackThreads by 1 and try again
      let s = servers.find((server) => server.hostName === hackHost); if (s) { s.availableRAM += hackThreadsLoop * costHack }
      s = servers.find((server) => server.hostName === weakenHost); if (s) { s.availableRAM += weakenThreadsLoop * costWeaken }
      s = servers.find((server) => server.hostName === growHost); if (s) { s.availableRAM += growThreadsLoop * costGrow }
      hackThreads -= 1;
      // flag to indicate that hack threads is changed, and hence new threads ratio has to be calculated
      recalculateThreads = true;
    }

    if (count % 10000 === 0) {
      // give some room for other scripts to run inbetween
      // scheduling all batches causes some lag if much ram is available
      if (count % 100000 === 0) {
        ns.tprint('batch manager is scheduling many batches, adding a sleep at batch number ', count)
      }
      await ns.sleep(1000);
    }
  }
  if (count === maxLoop) {
    ns.tprint('ended batch assignment loop because of count being ', count, 'this likely indicates something went wrong')
  }
  /*
  ns.tprint(hackThreads);
  for (let i = 1; i <= maxCores; i++) {
    ns.tprint(threadsPerCore.get(i));
  }*/
  // server is in ideal state but there is not enough ram to make a full batch
  // that could happend because of a huge amount of grow threads needed
  // in that case just hack it, and the next iteration of this loop will grow again.
  // this is expected to only be needed very early game when there is not a lot of ram available!
  if (activeBatches.length === 0) {
    ns.tprint('could not schedule HWGW batches, proceeding with scheduling HW batches');
    for (let i = 0; i < servers.length; i++) {
      createHWBatch(ns, servers[i].hostName, serverToHack);
    }
  }
  else {
    return (activeBatches as BatchHWGW[]).reduce((count, batch) => count + batch.hackThreads * moneyStolenSingle, 0);
  }
  return 0;
}


export const createHWGWBatch = (ns: NS, servers: { hostName: string, availableRAM: number, cpuCores: number }[], serverToHack: string, isLong: boolean | undefined) => {
  // OUTDATED, CURRENNTLY USING createHWGBatch instead!


  // initialize with assigning a batch with hack threads enough to hack all funds
  // but if the last server (has most ram available) cannot fit that then we can start lower
  let moneyHacked = 0;
  let hackThreadsFull = Math.floor(ns.hackAnalyzeThreads(serverToHack, ns.getServerMaxMoney(serverToHack) * 0.10));

  const weakenTime = ns.getWeakenTime(serverToHack);
  const hackTime = ns.getHackTime(serverToHack);
  const growTime = ns.getGrowTime(serverToHack);

  const costWeaken = ns.getScriptRam('scripts/weaken-single.ts');
  const costGrow = ns.getScriptRam('scripts/grow-single.ts');
  const costHack = ns.getScriptRam('scripts/hack-single.ts');

  let hackThreads = Math.min(hackThreadsFull, (Math.floor(servers[servers.length - 1].availableRAM / costHack)));
  // use grow for home if it has more than 1 core (unless home is 'way' bigger than other servers)
  let useGrowForHome = servers.length > 1 && ns.getServer('home').cpuCores > 1 && servers[servers.length - 1].availableRAM < 20 * servers[servers.length - 2].availableRAM;
  let count = 0;
  let moneyStolenSingle = ns.hackAnalyze(serverToHack) * ns.getServerMaxMoney(serverToHack);
  // get player object, and update throughout while loop to account for later batches!
  let player = ns.getPlayer();
  let server = ns.getServer(serverToHack);
  let maxLoop = 100000
  while (hackThreads > 1 && count < maxLoop) {
    count++;
    let xpFromThread = ns.formulas.hacking.hackExp(server, player);
    const moneyStolen = moneyStolenSingle * hackThreads;
    let weaken1Threads = Math.max(Math.ceil(hackThreads * 0.002 / 0.05), 1);
    let growThreads = hackThreads * 8; //?? cant use growthanalyze because it returns 0 if full money
    let weaken2Threads = Math.max(Math.ceil(growThreads * 0.004 / 0.05), 1);
    const serverAdjusted = ns.getServer(serverToHack);

    serverAdjusted.moneyAvailable = (serverAdjusted.moneyMax ?? 0) - moneyStolen;

    let hackpid = undefined as number | undefined
    let weaken1pid = undefined as number | undefined
    let growpid = undefined as number | undefined
    let weaken2pid = undefined as number | undefined
    let hackHost = undefined as string | undefined
    let weaken1Host = undefined as string | undefined
    let growHost = undefined as string | undefined
    let weaken2Host = undefined as string | undefined

    // servers start in ascending order of available ram, always try assigning from begin

    // try assign all 4 actions
    // assign hack
    for (let i = 0; i < servers.length; i++) {
      let serverObject = servers[i];
      if (serverObject.availableRAM >= costHack * hackThreads
        && (!useGrowForHome || serverObject.hostName !== 'home')
      ) {
        hackpid = ns.exec('scripts/hack-single.ts', serverObject.hostName, hackThreads, serverToHack, weakenTime - hackTime, !isLong);
        serverObject.availableRAM -= costHack * hackThreads;
        hackHost = serverObject.hostName;

        let xpGained = xpFromThread * hackThreads;
        player.exp.hacking += xpGained;
        player.skills.hacking = ns.formulas.skills.calculateSkill(player.exp.hacking, player.mults.hacking);
        break;
      }
    }
    // assign weaken1
    for (let i = 0; i < servers.length; i++) {
      let serverObject = servers[i];
      if (serverObject.availableRAM >= costWeaken * weaken1Threads
        && (!useGrowForHome || serverObject.hostName !== 'home')) {
        weaken1pid = ns.exec('scripts/weaken-single.ts', serverObject.hostName, weaken1Threads, serverToHack, 0);
        serverObject.availableRAM -= costWeaken * weaken1Threads;
        weaken1Host = serverObject.hostName;
        let xpGained = xpFromThread * weaken1Threads;
        player.exp.hacking += xpGained;
        player.skills.hacking = ns.formulas.skills.calculateSkill(player.exp.hacking, player.mults.hacking);
        break;
      }
    }
    let serversSortedGrow = [...servers].sort((a, b) => b.cpuCores - a.cpuCores);
    // assign grow
    for (let i = 0; i < servers.length; i++) {
      let serverObject = serversSortedGrow[i];
      growThreads = ns.formulas.hacking.growThreads(serverAdjusted, player, serverAdjusted.moneyMax ?? 0, 1);
      let growThreadsLocal = growThreads;
      if (ns.fileExists('Formulas.exe', 'home')) {
        growThreadsLocal = ns.formulas.hacking.growThreads(serverAdjusted, player, serverAdjusted.moneyMax ?? 0, ns.getServer(serverObject.hostName).cpuCores);
      }
      if (serverObject.availableRAM >= costGrow * growThreadsLocal) {
        growpid = ns.exec('scripts/grow-single.ts', serverObject.hostName, growThreadsLocal, serverToHack, weakenTime - growTime, isLong ?? false);
        serverObject.availableRAM -= costGrow * growThreadsLocal;
        growHost = serverObject.hostName;
        growThreads = growThreadsLocal;
        let xpGained = xpFromThread * growThreads;
        player.exp.hacking += xpGained;
        player.skills.hacking = ns.formulas.skills.calculateSkill(player.exp.hacking, player.mults.hacking);
        break;
      }
    }
    weaken2Threads = Math.max(Math.ceil(growThreads * 0.004 / 0.05), 1);
    // assign weaken2
    for (let i = 0; i < servers.length; i++) {
      let serverObject = servers[i];
      if (serverObject.availableRAM >= costWeaken * weaken2Threads
        && (!useGrowForHome || serverObject.hostName !== 'home')) {
        weaken2pid = ns.exec('scripts/weaken-single.ts', serverObject.hostName, weaken2Threads, serverToHack, 0);
        serverObject.availableRAM -= costWeaken * weaken2Threads;
        weaken2Host = serverObject.hostName;
        let xpGained = xpFromThread * weaken2Threads + growThreads;
        player.exp.hacking += xpGained;
        player.skills.hacking = ns.formulas.skills.calculateSkill(player.exp.hacking, player.mults.hacking);
        break;
      }
    }

    if (!hackpid || !weaken1pid || !growpid || !weaken2pid || !hackHost || !weaken1Host || !growHost || !weaken2Host) {
      for (let i = 0; i < servers.length; i++) {
        let serverObject = servers[i];
      }
      // if any script could not be scheduled kill all that are scheduled
      if (hackpid) {
        ns.kill(hackpid);
        player.exp.hacking -= hackThreads * xpFromThread;

        const s = servers.find((server) => server.hostName === hackHost); if (s) { s.availableRAM += hackThreads * costHack }
      }
      if (weaken1pid) {
        ns.kill(weaken1pid);
        player.exp.hacking -= weaken1Threads * xpFromThread;
        const s = servers.find((server) => server.hostName === weaken1Host); if (s) { s.availableRAM += weaken1Threads * costWeaken }
      }
      if (growpid) {
        ns.kill(growpid);
        player.exp.hacking -= growThreads * xpFromThread;
        const s = servers.find((server) => server.hostName === growHost); if (s) { s.availableRAM += growThreads * costGrow }
      }
      if (weaken2pid) {
        ns.kill(weaken2pid);
        player.exp.hacking -= weaken2Threads * xpFromThread;
        const s = servers.find((server) => server.hostName === weaken2Host); if (s) { s.availableRAM += weaken2Threads * costWeaken }
      }
      // decrease hack threads and try again
      player.skills.hacking = ns.formulas.skills.calculateSkill(player.exp.hacking, player.mults.hacking)
      hackThreads = Math.floor(hackThreads / 2);
    } else {
      // push succesfully scheduled batch to array, and try assignment again (with same threads)
      const start = new Date().getTime();
      const end = start + weakenTime
      const type = 'HWGW';
      // batch is always scheduled as last!
      activeBatches.push({
        start, end, type, weaken1pid, weaken1Host, weaken2Host, weaken2pid, growpid, growHost, hackpid, hackHost, weaken1Threads, weaken2Threads, growThreads, hackThreads, serverToHack
      })
      if (ns.fileExists('Formulas.exe', 'home')) {

      }
    }

  }
  if (count === maxLoop) {
    ns.tprint('ended batch assignment loop because of count being ', count, 'this likely indicates something went wrong')
  }
  // server is in ideal state but there is not enough ram to make a full batch
  // that could happend because of a huge amount of grow threads needed
  // in that case just hack it, and the next iteration of this loop will grow again.
  // this is expected to only be needed very early game when there is not a lot of ram available!
  if (activeBatches.length === 0) {
    ns.tprint('could not schedule HWGW batches, proceeding with scheduling HW batches');
    for (let i = 0; i < servers.length; i++) {
      createHWBatch(ns, servers[i].hostName, serverToHack);
    }
  }
  else {
    return (activeBatches as BatchHWGW[]).reduce((count, batch) => count + batch.hackThreads * moneyStolenSingle, 0);
  }
  return 0;
}


const killBatch = (ns: NS, batch: BatchHWGW) => {

  ns.kill(batch.weaken1pid);
  ns.kill(batch.weaken2pid);
  ns.kill(batch.growpid);
  ns.kill(batch.hackpid);

}

/*
* @returns the miliseconds that it takes (from the start) to execute the input log string
  format of log string is assumed to be similar to Executing on 'omega-net' in 1 minute 31.940 seconds
  hours, minutes and seconds are interpreted
*/

export const getDurationFromLog = (log: string) => {

  const words = log.split(' ');
  let duration = 0;
  const secondsIndex = words.findIndex((word) => word.startsWith('second'));
  const minutesIndex = words.findIndex((word) => word.startsWith('minute'));
  const hoursIndex = words.findIndex((word) => word.startsWith('hour'));

  if (secondsIndex >= 0) {
    duration += Number(words[secondsIndex - 1]) * 1000;
  }

  if (minutesIndex >= 0) {
    duration += Number(words[minutesIndex - 1]) * 1000 * 60;
  }

  if (hoursIndex >= 0) {
    duration += Number(words[hoursIndex - 1]) * 1000 * 60 * 60;
  }

  return duration;
}

export const writeBatches = (ns: NS) => {
  ns.write('data/batch-log.txt', JSON.stringify(activeBatches), 'w');
}

export const createHWBatch = async (ns: NS, hostName: string, serverToHack: string) => {
  const getServerRamAvailable = (ns: NS, server: string) => {
    let ram = ns.getServerMaxRam(server) - ns.getServerUsedRam(server);
    if (server === 'home' && ram > 100) {
      ram -= 50; // keep some ram free on home to run other scripts,
      // but only if plenty is available because in early game all is needed
    }
    return ram;
  }

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


    let hackThreads = Math.max(Math.floor(ram / (costHack + costWeaken / 25)), 1);
    let weaken1Threads = Math.max(Math.ceil(hackThreads / 25), 1);
    const hackpid = ns.exec('scripts/hack-single.ts', hostName, hackThreads, serverToHack, weakenTime - hackTime);
    const weaken1pid = ns.exec('scripts/weaken-single.ts', hostName, weaken1Threads, serverToHack,);


  }
}

export function writeServerState(ns: NS, serverToHack: string) {
  // write server state to port
  const server = ns.getServer(serverToHack);
  const data = {
    maxMoney: server.moneyMax,
    moneyAvailable: server.moneyAvailable,
    securityLevel: server.hackDifficulty,
    minSecurityLevel: server.minDifficulty,
  }
  ns.write('data/serverToHackState.json', JSON.stringify(data), 'w');
}

/*
* @returns TRUE if the server is in ideal state (max money and min security level)
*/
export function checkServerState(ns: NS, serverToHack: string, prompt?: boolean) {

  const server = ns.getServer(serverToHack);
  if (server.moneyAvailable && server.hackDifficulty && server.moneyMax && server.minDifficulty &&
    (server.moneyAvailable < server.moneyMax || server.hackDifficulty > server.minDifficulty)) {
    if (prompt) {
      ns.prompt('After a full batch, the server was not in ideal state\n' + JSON.stringify({
        maxMoney: server.moneyMax,
        moneyAvailable: server.moneyAvailable,
        securityLevel: server.hackDifficulty,
        minSecurityLevel: server.minDifficulty,
      }))
    }
    return false
  }
  return true;
}

export function updateHUD(ns: NS, expectedGain: number) {
  if (!!globals.HUDPort) {
    let dataToWrite = { sequence: 3, rows: [] as HUDRow[] }

    let remaningSeconds = Math.round((activeBatches[0].end - new Date().getTime()) / 1000);

    dataToWrite.rows.push({ header: 'Hacking server', value: `${activeBatches[0].serverToHack}` });
    dataToWrite.rows.push({ header: 'Gain on completion', value: `${ns.formatNumber(expectedGain)}` });
    dataToWrite.rows.push({ header: 'Remaining', value: `${ns.formatNumber(remaningSeconds, 0)} s` });

    ns.writePort(globals.HUDPort, dataToWrite)
  }
}





// log to assign only enough GW batch, but kinda useless without formulas because the rest of the HWGW batches after wards cannot be properly calculated
/* const multiplierForMax = ns.getServerMaxMoney(serverToHack) / ns.getServerMoneyAvailable(serverToHack);
    const growThreadsNeededFull = Math.ceil(ns.growthAnalyze(serverToHack, multiplierForMax));
    const weakenThreadsNeededFull = Math.ceil(growThreadsNeededFull / 12.5);
    const totalRamAvailable = servers.reduce((partialSum, server) => partialSum + server.availableRAM, 0);

    // calculate ratio to assign based on all avaialble ram
    // as we cannot use all ram because its spread on different servers, we will simply assign
    // and then afterwards kill grow threads if not enough weaken threads could be assigned
    const ratioToAssign = Math.min(totalRamAvailable / (growThreadsNeededFull * costGrow + weakenThreadsNeededFull * costWeaken), 1);

    let growThreadsAssigned = 0;
    let weakenThreadsAssigned = 0;
    const growThreadsToAssign = Math.max(Math.floor(growThreadsNeededFull * ratioToAssign), 1);
    const weakenThreadsToAssign = Math.max(Math.ceil(growThreadsToAssign / 12.5), 1);
    const assignedGrows = [] as Array<{ pid: number, growThreads: number }>;
    for (let i = 0; i < servers.length; i++) {
      const server = servers[i];
      let availableRAM = server.availableRAM
      if (growThreadsAssigned < growThreadsToAssign) {
        const growThreads = Math.min(Math.floor(availableRAM / costGrow), growThreadsToAssign - growThreadsAssigned);
        if (growThreads > 0) {
          growThreadsAssigned += growThreads;
          const pid = ns.exec('scripts/grow-single.ts', server.hostName, growThreads, serverToHack, weakenTime - growTime);
          server.availableRAM -= growThreads * costGrow;
          assignedGrows.push({ pid, growThreads });
        }
      }
      // assign weaken only if all grow have been assigned to ensure proper sequencing!
      if (growThreadsAssigned >= growThreadsToAssign &&
        weakenThreadsAssigned < weakenThreadsToAssign) {
        const weakenThreads = Math.min(Math.floor(availableRAM / costWeaken), weakenThreadsToAssign - weakenThreadsAssigned);
        if (weakenThreads > 0) {
          weakenThreadsAssigned += weakenThreads;
          server.availableRAM -= weakenThreads * costWeaken;
          ns.exec('scripts/weaken-single.ts', server.hostName, weakenThreads, serverToHack, 0);
        }
      }
    }
    if (growThreadsAssigned < growThreadsNeededFull || weakenThreadsAssigned < weakenThreadsNeededFull) {
      let count = 0;
      // to not raise security, kill grow threads as long as there are not enough weaken threads
      while (growThreadsAssigned > Math.floor(12.5 * weakenThreadsAssigned) && count < 10000) {
        count++;
        const growToRemove = assignedGrows.shift();
        if (growToRemove) // should always exist because otherwise growThreadsAssigned should be 0.
        {
          ns.kill(growToRemove.pid);
          growThreadsAssigned -= growToRemove.growThreads;
        }
      }
      return ns.sleep(weakenTime)// not the max number of grow/weaken was assigned which must mean there is no ram left
    */