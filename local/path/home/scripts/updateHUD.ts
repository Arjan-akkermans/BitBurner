let file = 'data/globals.json';
let globals = {} as Globals;
let datas = new Map<number, HUDRow[]>;
export async function main(ns: NS) {
  // write PID of this script to port so that other scripts now where to write their information to
  globals = JSON.parse(ns.read(file))
  globals.HUDPort = ns.pid;

  ns.write('data/globals.json', JSON.stringify(globals), 'w');
  let doc = eval('document');
  const hook0 = doc.getElementById('overview-extra-hook-0');
  const hook1 = doc.getElementById('overview-extra-hook-1');
  while (true) {
    const headers = [];
    const values = [];
    // retrieves and updates data from all scripts
    updateDatasFromPort(ns);

    // Get all keys, convert to array, and sort
    const sortedKeys = Array.from(datas.keys()).sort();

    for (const key of sortedKeys) {
      const rows = datas.get(key) as HUDRow[];
      for (const row of rows) {
        headers.push(row.header);
        values.push(row.value)
      }
    }
    // add generic logging not from scripts
    headers.unshift('Karma');
    values.unshift(ns.getPlayer().karma);
    // Now drop it into the placeholder elements
    hook0.innerText = headers.join("\n");
    hook1.innerText = values.join("\n");
    await ns.sleep(100);
  }
}

export function updateDatasFromPort(ns: NS) {
  let data = ns.readPort(ns.pid) as PortHUDData | 'NULL PORT DATA';
  while (data !== 'NULL PORT DATA') {
    datas.set(data.sequence, data.rows);
    data = ns.readPort(ns.pid);
  }
}
