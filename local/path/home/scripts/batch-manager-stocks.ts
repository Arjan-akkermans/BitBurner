import { getServerToHack, getAllServers } from './utils'
let file = 'data/globals.json';
const fileStocks = 'data/stocks.json';

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
function isBatchHWGW(batch: BatchW | BatchGW | BatchHWGW): batch is BatchHWGW {
    return batch.type === 'HWGW'
}
let activeBatches = [] as (BatchW | BatchGW | BatchHWGW)[];

type StocksInformation = {
    stocks?: Stock[],
    timeLastTick: number,
    numberOfCyclesCompleted: number,
    totalStocksValue: number,
    totalShortEarned: number,
    totalLongEarned: number,
    overalActual: OveralActual[],
    currentTick: number, // current tick count, counted from start, resets per cycle (at 75)
    inversionTick?: number, // the tick where we (predict) the inversion happens
    inversionTickPredicted?: number,
}
type Stock = {
    symbol: string,
    numberOfStocks: number,
    numberOfShorts: number,
    priceBought: number,
    expectedSellPrice: number, // note expected profit is only for keeping the current cycle!
    actuals: StockActual[]
};

// object used to denote statistics over all stocks
type OveralActual = {
    predictedInversions: number // number of predicted inversions for this tick. this will be cycled meaning it contains the cumalitve count since script start
}
type StockActual = {
    ask: number,
    bid: number,
    price: number,
    spreadRatio: number,
    forecastLongEstimated?: number, // probability that a stock increases, based on long window, used for determining inversions
    forecastShortEstimated?: number, // probability that a stock increases, based on short window, used for forecasting expected returns
    forecast?: number,
    predictedInversion: boolean, // true if the stock is predicted to have inverted based on comparison the last 20 ticks, only checked every 10 ticks
    volatilityEstimated?: number, // max volatility, based on the observed value of last 20
    volatility?: number,
    pointChange: number, // change in ask price as compared to previous in points [0.infinity]
    /** the number with which the previous ask price was multipled */
    differenceAskPrevious: number,
    differenceAskBid: number,

}

let stocksInformation = {} as StocksInformation;


export async function main(ns: NS) {
    if (ns.hasRootAccess('n00dles') && ns.args.length < 2 || (ns.args[2] as boolean)) {
        // run all scripts once to compile them (ensures proper sequencing)
        ns.exec('scripts/grow-single.ts', 'home', 1, 'n00dles');
        ns.exec('scripts/hack-single.ts', 'home', 1, 'n00dles');
        ns.exec('scripts/weaken-single.ts', 'home', 1, 'n00dles');
    }

    stocksInformation = JSON.parse(ns.read(fileStocks)) as StocksInformation;
    let maxStock = '';
    let maxStockValue = 0;
    let serverToHack = undefined;
    let isLong = true;
    for (let stock of stocksInformation.stocks ?? []) {
        let serverToConsider = getServerForStock(ns, stock.symbol);
        if(!serverToConsider){continue}
        ns.tprint(stock.numberOfShorts, stock.numberOfStocks, ns.hasRootAccess(serverToConsider ?? ''));
        if ((stock.numberOfShorts === 0 && stock.numberOfShorts === 0) || !serverToConsider || ns.hasRootAccess(serverToConsider)) {
            continue;
        }
        // for now just only consider long stocks?
        let isLong = stock.numberOfStocks > 0;
        let expectedProfit = stock.expectedSellPrice
        if (expectedProfit * stock.numberOfStocks > maxStockValue) {
            maxStock = stock.symbol;
            maxStockValue = expectedProfit * stock.numberOfStocks;
            isLong = stock.numberOfStocks > 0;
            serverToHack = serverToConsider;
        }
    }

    while (true && serverToHack) {


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
        const freeRamForHome = 0;
        let serversObject = servers.map((server) => {
            let serverFull = ns.getServer(server);
            return { hostName: server, availableRAM: ns.getServerMaxRam(server) - ns.getServerUsedRam(server) - (server === 'home' ? freeRamForHome : 0), cpuCores: serverFull.cpuCores }
        })
        //ns.tprint( serversObject);
        await updateBatches(ns, serversObject, serverToHack, isLong);

    }
}

export const updateBatches = async (ns: NS, servers: { hostName: string, availableRAM: number, cpuCores: number }[], serverToHack: string, isLong: boolean) => {

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
                ns.exec('scripts/grow-single.ts', server.hostName, growThreads, serverToHack, weakenTime - growTime, isLong)
            ns.exec('scripts/weaken-single.ts', server.hostName, weakenThreads, serverToHack, 0);
        }
        await ns.sleep(weakenTime);
        return moneyHacked;
    }

    else {
        // server is in ideal state (lowest security highest money)
        moneyHacked = createHWGWBatch(ns, servers, serverToHack, isLong);
        //writeBatches(ns);
        // wait till last script is completed
        let pidtoWaitOn = ((activeBatches[activeBatches.length - 1]) as BatchHWGW)?.weaken2pid;
        while (pidtoWaitOn && ns.isRunning(pidtoWaitOn)) {
            await ns.sleep(100);
        }
        checkServerState(ns, serverToHack, true);
        return moneyHacked;
    }
}

export const createHWGWBatch = (ns: NS, servers: { hostName: string, availableRAM: number, cpuCores: number }[], serverToHack: string, isLong: boolean) => {
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
                growpid = ns.exec('scripts/grow-single.ts', serverObject.hostName, growThreadsLocal, serverToHack, weakenTime - growTime, isLong);
                serverObject.availableRAM -= costGrow * growThreadsLocal;
                growHost = serverObject.hostName;
                growThreads = growThreadsLocal;
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
                break;
            }
        }

        if (!hackpid || !weaken1pid || !growpid || !weaken2pid || !hackHost || !weaken1Host || !growHost || !weaken2Host) {
            for (let i = 0; i < servers.length; i++) {
                let serverObject = servers[i];
            }
            // if any script could not be scheduled kill all that are scheduled
            if (hackpid) {
                ns.kill(hackpid); const s = servers.find((server) => server.hostName === hackHost); if (s) { s.availableRAM += hackThreads * costHack }
            }
            if (weaken1pid) { ns.kill(weaken1pid); const s = servers.find((server) => server.hostName === weaken1Host); if (s) { s.availableRAM += weaken1Threads * costWeaken } }
            if (growpid) { ns.kill(growpid); const s = servers.find((server) => server.hostName === growHost); if (s) { s.availableRAM += growThreads * costGrow } }
            if (weaken2pid) { ns.kill(weaken2pid); const s = servers.find((server) => server.hostName === weaken2Host); if (s) { s.availableRAM += weaken2Threads * costWeaken } }
            // decrease hack threads and try again
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
                let xpFromThread = ns.formulas.hacking.hackExp(server, player)
                let xpGainedFromBatch = xpFromThread * (hackThreads + weaken1Threads + weaken2Threads + growThreads);
                player.exp.hacking += xpGainedFromBatch;
                player.skills.hacking = ns.formulas.skills.calculateSkill(player.exp.hacking, player.mults.hacking);
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
            ns.prompt('After a HWGW batch, the server was not in ideal state\n' + JSON.stringify({
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

export function getServerForStock(ns: NS, symbol: string) {

    const locations = [{ "location": "ECorp", "sym": "ECP", "server": "ecorp" }, { "location": "MegaCorp", "sym": "MGCP", "server": "megacorp" }, { "location": "Blade Industries", "sym": "BLD", "server": "blade" }, { "location": "Clarke Incorporated", "sym": "CLRK", "server": "clarkinc" }, { "location": "OmniTek Incorporated", "sym": "OMTK", "server": "omnitek" }, { "location": "Four Sigma", "sym": "FSIG", "server": "4sigma" }, { "location": "KuaiGong International", "sym": "KGI", "server": "kuai-gong" }, { "location": "Fulcrum Technologies", "sym": "FLCM", "server": "fulcrumassets" }, { "location": "Storm Technologies", "sym": "STM", "server": "stormtech" }, { "location": "DefComm", "sym": "DCOMM", "server": "defcomm" }, { "location": "Helios Labs", "sym": "HLS", "server": "helios" }, { "location": "VitaLife", "sym": "VITA", "server": "vitalife" }, { "location": "Icarus Microsystems", "sym": "ICRS", "server": "icarus" }, { "location": "Universal Energy", "sym": "UNV", "server": "univ-energy" }, { "location": "AeroCorp", "sym": "AERO", "server": "aerocorp" }, { "location": "Omnia Cybersystems", "sym": "OMN", "server": "omnia" }, { "location": "Solaris Space Systems", "sym": "SLRS", "server": "solaris" }, { "location": "Global Pharmaceuticals", "sym": "GPH", "server": "global-pharm" }, { "location": "Nova Medical", "sym": "NVMD", "server": "nova-med" }, { "location": "LexoCorp", "sym": "LXO", "server": "lexo-corp" }, { "location": "Rho Construction", "sym": "RHOC", "server": "rho-construction" }, { "location": "Alpha Enterprises", "sym": "APHE", "server": "alpha-ent" }, { "location": "SysCore Securities", "sym": "SYSC", "server": "syscore" }, { "location": "CompuTek", "sym": "CTK", "server": "computek" }, { "location": "NetLink Technologies", "sym": "NTLK", "server": "netlink" }, { "location": "Omega Software", "sym": "OMGA", "server": "omega-net" }, { "location": "FoodNStuff", "sym": "FNS", "server": "foodnstuff" }, { "location": "Joe's Guns", "sym": "JGN", "server": "joesguns" }, { "location": "Sigma Cosmetics", "sym": "SGC", "server": "sigma-cosmetics" }, { "location": "Catalyst Ventures", "sym": "CTYS", "server": "catalyst" }, { "location": "Microdyne Technologies", "sym": "MDYN", "server": "microdyne" }, { "location": "Titan Laboratories", "sym": "TITN", "server": "titan-labs" }]
    let location = locations.find((location) => location.sym === symbol);
    return location?.server;
}