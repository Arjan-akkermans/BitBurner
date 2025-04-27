const file = 'data/stocks.json';

export async function main(ns: NS) {
  sellStocks(ns);
  ns.write(file, JSON.stringify({}), 'w');
}

export function sellStocks(ns: NS) {
  if (!ns.stock.hasTIXAPIAccess()) {
    return
  }
  let symbols = ns.stock.getSymbols();
  for (let symbol of symbols) {
    let positions = ns.stock.getPosition(symbol);

    if (positions[0] > 0) {
      ns.stock.sellStock(symbol, positions[0])
    }
    if (positions[2] > 0) {
      ns.stock.sellShort(symbol, positions[2]);
    }
  }
}

