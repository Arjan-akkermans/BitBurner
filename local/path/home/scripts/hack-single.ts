export async function main(ns: NS) {

  let additionalMsec = ns.args.length > 1 ? ns.args[1] as number : 0;
  let stock = ns.args.length > 2 ? ns.args[2] as boolean : false;
  // send log to 'batch logging port'
  const result = await ns.hack(ns.args[0] as string, { additionalMsec, stock });
  //ns.getPortHandle(1).write({ type: 'batchActionLog', log: new Date().getTime() + ' completed hack of ' + ns.args[0] + '. ' + result, pid: ns.pid });
}