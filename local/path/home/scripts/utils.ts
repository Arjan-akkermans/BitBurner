// from https://stackfull.dev/graph-data-structure-in-typescript
export function dfs(ns: NS, startNode: Server) {
  // separate set object for the host name as that is the/a unique identifier 
  const visited: Set<string> = new Set();
  const stack: string[] = [];
  stack.push(startNode.hostname);

  while (stack.length > 0) {
    const currentNode = stack.pop()!;
    if (!visited.has(currentNode)) {
      visited.add(currentNode);

      for (const neighbor of ns.scan(currentNode)) {
        stack.push(neighbor);
      }
    }
  }
  return visited;
}

export function getAllServers(ns: NS) {
  return dfs(ns, ns.getServer('home'))
}

export function getAllPersonalServers(ns: NS) {
  const allServers = [...dfs(ns, ns.getServer('home'))];
  const personalServers = allServers.filter((server) => server.startsWith('pserv-'));
  return personalServers;

}
// get server to hack
export function getServerToHack(ns: NS) {

  const hackingThreshold = Math.floor(ns.getHackingLevel() / 2);
  const allServers = dfs(ns, ns.getServer('home'));
  let serverToHack = undefined as undefined | string;
  let serverToHackMax = 0;
  const costWeaken = ns.getScriptRam('scripts/weaken-single.ts');
  const costGrow = ns.getScriptRam('scripts/grow-single.ts');
  const costHack = ns.getScriptRam('scripts/hack-single.ts');
  const player = ns.getPlayer();
  allServers.forEach((serverHostName) => {
    const server = ns.getServer(serverHostName);
    if (server.hasAdminRights) {
      if (ns.fileExists('Formulas.exe')) {

        // assuming we only do say 20 hacking iterations of the server
        // we want to apply some penalty for the initial weaken time
        // the initial weaken time will partly be added to the batch length time
        const initialWeakenTime = ns.getWeakenTime(server.hostname);
        const initialWeakenTimePenalty = 0.05;
        // this is here because currently my implementation blocks other scripts, hence a long initial time is quite bad.
        const hardLimitWeakenDuration = 5 * 60 * 1000;
        server.moneyAvailable = server.moneyMax
        let threads = getHGWThreads(ns, server, 1, player);
        const batchLength = ns.formulas.hacking.weakenTime(server, player);
        let penaltyTime = (initialWeakenTime * initialWeakenTimePenalty)
        //ns.tprint({ serverHostName, batchLength, penaltyTime, hackChance, ramForBatch })
        const moneyPerTimePerRam = threads.bestMoneyPerRam / (batchLength + penaltyTime);
        //ns.tprint({ serverHostName, batchLength, hackChance, ramForBatch, moneyMax, moneyPerTimePerRam })
        // added sanity check to ignore server if the security level has been risen too high (likely because of an earlier mistake)
        if (initialWeakenTime < hardLimitWeakenDuration && moneyPerTimePerRam > serverToHackMax && (ns.getHackTime(server.hostname) > 1000) && (ns.getHackTime(server.hostname) < (60 * 60 * 1000))) {
          serverToHackMax = moneyPerTimePerRam;
          serverToHack = server.hostname;
        }
      }

      else {
        if (!!server.requiredHackingSkill
          && server.requiredHackingSkill <= hackingThreshold
          && (server.numOpenPortsRequired ?? 0) <= (server.openPortCount ?? 0)) {
          const newMoney = ns.getServerMaxMoney(server.ip);
          if (!serverToHackMax || (newMoney > serverToHackMax)) {
            serverToHack = server.hostname;
            serverToHackMax = newMoney;
          }
        }
      }
    }
  }

  )
  return serverToHack ?? 'n00dles';
}

export function getHGWThreads(ns: NS, server: Server, cores: number, player: Person) {
  // returns the optimal HGW threads for a batch, assuming current player stats, and optimal serverState, using cores for the growth
  const costWeaken = ns.getScriptRam('scripts/weaken-single.ts');
  const costGrow = ns.getScriptRam('scripts/grow-single.ts');
  const costHack = ns.getScriptRam('scripts/hack-single.ts');
  let hackThreads = 0;
  let growThreads = 0;
  let weakenThreads = 0;
  let bestMoneyPerRam = 0;
  let stolenPerHack = ns.formulas.hacking.hackPercent(server, player);
  let maxHackThreads = Math.floor(1 / stolenPerHack);
  if (!server.moneyAvailable || !server.moneyMax || !server.hackDifficulty || !server.minDifficulty || stolenPerHack === 0) {
    return { hackThreads, growThreads, weakenThreads, bestMoneyPerRam }
  }

  for (let i = 1; i <= maxHackThreads; i++) {

    // weaken lowers by 0.05
    // hack/grow increases by 0.002
    let hackT = i;
    let threads = getHGWThreadsFromHackThread(ns, server, cores, hackT, player);

    let moneyGained: number = stolenPerHack * threads.hackThreads * server.moneyAvailable;
    let moneyPerRam = moneyGained / (threads.hackThreads * costHack + threads.growThreads * costGrow + threads.weakenThreads * costWeaken);
    if (moneyPerRam > bestMoneyPerRam) {
      bestMoneyPerRam = moneyPerRam;
      hackThreads = threads.hackThreads;
      growThreads = threads.growThreads;
      weakenThreads = threads.weakenThreads;
    }
  }

  return { hackThreads, growThreads, weakenThreads, bestMoneyPerRam }
}

export function getHGWThreadsFromHackThread(ns: NS, server: Server, cores: number, hackThreads: number, player: Person) {

  // weaken lowers by 0.05
  // hack/grow increases by 0.002
  hackThreads;
  let growThreads = 0;
  let weakenThreads = 0;
  server.moneyAvailable = server.moneyMax;
  server.hackDifficulty = server.minDifficulty;
  let stolenPerHack = ns.formulas.hacking.hackPercent(server, player);
  if (!server.moneyMax || !server.moneyAvailable || !server.hackDifficulty || !server.minDifficulty || stolenPerHack === 0) {
    return { hackThreads, growThreads, weakenThreads }
  }

  let moneyGained: number = stolenPerHack * hackThreads * server.moneyAvailable;
  server.hackDifficulty = server.hackDifficulty + hackThreads * 0.002
  server.moneyAvailable = server.moneyAvailable - moneyGained;
  growThreads = ns.formulas.hacking.growThreads(server, player, server.moneyMax, cores);
  server.hackDifficulty = server.hackDifficulty + growThreads * 0.004;
  weakenThreads = Math.ceil(server.hackDifficulty - server.minDifficulty) / 0.05;

  server.moneyAvailable = server.moneyMax;
  server.hackDifficulty = server.minDifficulty;

  return { hackThreads, growThreads, weakenThreads }
}



// https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm
/*
* @returns array of servers to connect to in order to reach target from source, excluding target, undefined if node is not reachable
*/
export function getShortestPath(ns: NS, source: string, target: string) {

  type node = {
    name: string,
    shortestPath: string[] | undefined // string of nodes to connect to starting from source
  }
  const nodes = [] as node[];
  let targetNode = undefined as node | undefined;
  // initialise nodes with all available servers
  // initial shortest path is 0 for source and undefined for all others
  // save reference to target node
  const nodeNames = dfs(ns, ns.getServer(source));
  nodeNames.forEach((node) => {
    nodes.push({ name: node, shortestPath: node === source ? [] : undefined })
    if (node === target) {
      targetNode = nodes[nodes.length - 1];
    }
  })

  const unvisited = [...nodeNames];

  let count = 0;

  while (targetNode && !targetNode.shortestPath && unvisited && count < 10000) {
    count++;
    // find node with min length
    let minUnvisited = undefined as node | undefined;
    for (let i = 0; i < unvisited.length; i++) {
      let node = nodes.find((node) =>
        node.name === unvisited[i]
      );

      if (node && node.shortestPath !== undefined && (node.shortestPath.length < (minUnvisited?.shortestPath?.length ?? Number.MAX_SAFE_INTEGER))) {
        minUnvisited = {
          name: node.name, shortestPath: !!node.shortestPath ? [...node.shortestPath] : undefined
        };

      }
    }

    if (!minUnvisited) {
      break;
    }
    // remove node from unvisited
    unvisited.splice(unvisited.indexOf(minUnvisited.name), 1)

    // find neighbors of current node, and update the shortest path of all its neighbors
    ns.scan(minUnvisited.name).forEach((name) => {
      let nodeToUpdate = nodes.find((node) => node.name === name);
      if (nodeToUpdate) {
        nodeToUpdate.shortestPath = minUnvisited.shortestPath ? [...minUnvisited.shortestPath] : []
        nodeToUpdate.shortestPath.push(minUnvisited.name);
      }
    })

  }

  return targetNode?.shortestPath;
}

export function getServerConnectString(ns: NS, target: string) {
  {
    const currentServer = ns.getHostname();
    const path = getShortestPath(ns, currentServer, target);
    let connectString = '';

    if (path) {
      path.forEach((server) => {
        connectString += 'connect ' + server + ';'
      })
      connectString += 'connect ' + target + ';'
      navigator.clipboard.writeText(connectString);
      ns.tprint('pasted connectstring to clipboard!')
    }
    else {
      ns.tprint('no path found to server ', target);
    }
  }
}

export function infectServer(ns: NS, server: Server) {

  const currentHackinglevel = ns.getHackingLevel();
  const hostname = server.hostname;
  if (!!server.requiredHackingSkill && (server.requiredHackingSkill <= currentHackinglevel)) {
    if (ns.fileExists('BruteSSH.exe', 'home')) {
      ns.brutessh(hostname);
    }
    if (ns.fileExists('FTPCrack.exe', 'home')) {
      ns.ftpcrack(hostname);
    }
    if (ns.fileExists('relaySMTP.exe', 'home')) {
      ns.relaysmtp(hostname);
    }
    if (ns.fileExists('HTTPWorm.exe', 'home')) {
      ns.httpworm(hostname);
    }
    if (ns.fileExists('SQLInject.exe', 'home')) {
      ns.sqlinject(hostname);
    }
    // get server because the steps above might have opened enough ports
    if ((ns.getServer(hostname).openPortCount ?? 0) >= (server.numOpenPortsRequired ?? 0)) {
      ns.tprint('hacking server ', server.hostname)
      ns.nuke(hostname);
      return true
    }
  }
  return false;
}

export function updateSkip(ns: NS, skip: boolean) {
  ns.write('data/skip.txt', skip ? 'true' : 'false', 'w');
}

export function getSkip(ns: NS) {
  return ns.read('data/skip.txt') === 'true';
}

// source chat gpt
export function sortAugments(ns: NS, augments: string[]) {
  // Define the function to perform topological sorting
  function topologicalSort(strings: string[], prerequisites: { name: string, dependencies: string[] }[]): string[] {
    // Step 1: Create a map of the dependencies for each string
    const graph: { [key: string]: string[] } = {};
    const inDegree: { [key: string]: number } = {};

    // Initialize graph and inDegree map
    strings.forEach(str => {
      graph[str] = [];
      inDegree[str] = 0;
    });

    // Step 2: Build the graph from the prerequisites
    prerequisites.forEach(prereq => {
      prereq.dependencies.forEach(dependency => {
        graph[dependency].push(prereq.name);  // dependency -> name
        inDegree[prereq.name]++;             // increment in-degree for the name
      });
    });

    // Step 3: Initialize the queue with all nodes that have no dependencies (in-degree 0)
    const queue: string[] = [];
    strings.forEach(str => {
      if (inDegree[str] === 0) {
        queue.push(str);
      }
    });

    const result: string[] = [];

    // Step 4: Process the queue
    while (queue.length > 0) {
      const current = queue.shift()!;  // Get the first item from the queue

      result.push(current);  // Add it to the result

      // Reduce the in-degree for all neighbors
      graph[current].forEach(neighbor => {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          queue.push(neighbor);  // Add to the queue if its in-degree is now 0
        }
      });
    }

    // Step 5: Return the result
    return result;
  }

  augments = augments.sort((a, b) => ns.singularity.getAugmentationBasePrice(b) - ns.singularity.getAugmentationBasePrice(a))

  // only account for dependencies also in the set to purchase and if not already owned
  let dependencies = augments.map((augment) => {
    let allDependencies = ns.singularity.getAugmentationPrereq(augment);
    let dependenciesLocal = allDependencies.filter((dependency) => !ns.singularity.getOwnedAugmentations().includes(dependency)
      && augments.includes(dependency));
    return ({ name: augment, dependencies: dependenciesLocal })
  })


  return topologicalSort(augments, dependencies)
}

export function getXpNeeded(ns: NS, level: number) {
  let player = ns.getPlayer();
  let xpToReach = ns.formulas.skills.calculateExp(level, player.mults.hacking);
  let currentXP = ns.formulas.skills.calculateExp(player.skills.hacking, player.mults.hacking);
  ns.tprint('current time ', new Date().getTime());
  ns.tprint('xp to reach for ', level, ' : ', xpToReach);
  ns.tprint('current xp: ', currentXP);
  ns.tprint('0-1 there: ', currentXP / xpToReach);
}


export function formatNumber(ns: NS, n: number) {

}