export async function main(ns: NS) {

  let additionalMsec = ns.args.length > 1 ? ns.args[1] as number : 0;
  // send log to 'batch logging port'
  const result = await ns.grow(ns.args[0] as string, { additionalMsec });
  //ns.getPortHandle(1).write({ type: 'batchActionLog', log: new Date().getTime() + ' completed grow of ' + ns.args[0] + '. ' + result, pid: ns.pid })
}