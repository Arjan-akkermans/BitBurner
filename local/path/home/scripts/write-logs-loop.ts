export async function main(ns: NS) {

  const logFile = 'data/log-batch-manager.txt'
  while (true) {
    if (ns.getPortHandle(1).empty()) {
      await ns.nextPortWrite(1);
      continue;
    }
    const data = ns.readPort(1);
    ns.write(logFile, JSON.stringify(data) + '\n', 'a')
  }
}