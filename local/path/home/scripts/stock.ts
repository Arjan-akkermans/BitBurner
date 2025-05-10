
// buy stock for ask sell for bid
// buy short for bid sell for ask
// bull rise
// bear drop



/* some introduction
// a stock has a probability > 0.5 and a state, bull or bear
// with probability it will follow the current treand, up for bull, down for bear
// each 75 ticks, with p=0.45 the stock will flip
// with TIX data access the forecast is accuratem
// otherwise the probability and volatility are estimated
// based on the current tick in the cycle, and the (estimated) forecast and volatility
// stocks are bought. Whenever this increase is below 1, then the stock will be sold
*/

const file = 'data/stocks.json';
const logFile = 'data/logs/stocks.txt';
const maxMoneyPerTransaction = 1000000000000 // 1t for now?
const maxRatioPerTransaction = 0.1 // to ensure not all money spend on 1 stock; 
const transactionFee = 100000;
const thresholdToGain = transactionFee * 5; // transactionCost * 5? Note that at least 2 transaction cost need to be covered
const ticksForInversion = 75;
const foreCastLongWindow = 75; // window used for determining the probability of a stock
const foreCastShortWindow = 20; // number of ticks to observe before buying if basing on forecast
const actualsLength = ticksForInversion + 1;

const predictedLongBuyFrom = 0.65; // when using prediction only buy if prediction is at least this
const predictedShortBuyFrom = 0.2; // when using prediction only buy if prediction is at most this
const adjustedForecastForLong = 0.2; // [0.1] used to nudge the forecast to 0.5 when doing estimations, intended to be more sure of investments
const adjustedForecastShort = 0.5; // [0.1] used to nudge the forecast to 0.5 when doing estimations, intended to be more sure of investments
const inversionTolerance = 0.10 // only count an inversion if flip from 0.5+i to 0.5-i.
// as higher probabilities can be observer easier, this gives a better indication
let inversionsBasedOnPrediction = 0; // debug variable to ???
let inversionsMaxCycleIndex = 0; // debug variable, not current max inversions index
let currentMaxInversionsAverage = 0; // debug variable to show max and limit needed for forecast inverstion
let stockToHack = {} as Stock; // debug
let serverToHack = undefined as string | undefined //debug

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
    if (!checkGetAccess(ns)) {
        await waitAndRestart(ns);
    }
    getTIXAPI(ns);
    let startingMoney = ns.getServerMoneyAvailable('home');
    stocksInformation = JSON.parse(ns.read(file)) as StocksInformation;
    // 6000ms is normal time between two ticks
    if (!stocksInformation.stocks || stocksInformation.timeLastTick + 9000 < new Date().getTime()) {
        stocksInformation = initialize(ns);
    }
    // update actuals, and sort most profitable first
    updateActuals(ns);
    detectInversions(ns);
    sellStocks(ns);
    buyStocks(ns);

    hackStocks(ns);
    updateHUD(ns);

    //debug(ns);
    updateCycle(ns);

    ns.write(file, JSON.stringify(stocksInformation), 'w');
    await waitAndRestart(ns);
}

export async function waitAndRestart(ns: NS) {
    await ns.stock.nextUpdate();
    ns.spawn('scripts/stock.ts', { spawnDelay: 0 })
}

export function resetStocks(ns: NS) {

    ns.write(file, JSON.stringify({}), 'w');
}

export function initialize(ns: NS): StocksInformation {
    const stockSymbols = ns.stock.getSymbols();
    let stocks = [];
    for (let symbol of stockSymbols) {
        stocks.push({ symbol, numberOfStocks: 0, numberOfShorts: 0, priceBought: 0, expectedSellPrice: 0, actuals: [] })
    }
    ns.write(logFile, 'start at ' + new Date().getTime().toLocaleString() + '\n', 'w');
    return { stocks: [...stocks], timeLastTick: new Date().getTime(), numberOfCyclesCompleted: 0, totalLongEarned: 0, totalShortEarned: 0, totalStocksValue: 0, overalActual: [], currentTick: 1 }
}

export function updateCycle(ns: NS) {
    stocksInformation.currentTick = stocksInformation.currentTick + 1;
    if (stocksInformation.currentTick > ticksForInversion) {
        stocksInformation.currentTick = 1;
        stocksInformation.numberOfCyclesCompleted = stocksInformation.numberOfCyclesCompleted + 1;
        ns.write(logFile, ' actual after cycle: ' + stocksInformation.numberOfCyclesCompleted + '\n', 'a');
        ns.write(logFile, stocksInformation.overalActual.map((o) => String(o.predictedInversions)).toString() + '\n', 'a');
    }
}

export function updateActuals(ns: NS) {
    // update actuals based on current state
    let previousPredictedIInversions = 0;
    stocksInformation.timeLastTick = new Date().getTime();
    stocksInformation.totalStocksValue = 0;
    if (stocksInformation.overalActual.length === actualsLength) {
        let lost = stocksInformation.overalActual.shift();
        previousPredictedIInversions = stocksInformation.overalActual[0].predictedInversions;
    }

    stocksInformation.overalActual.push({ predictedInversions: previousPredictedIInversions });

    for (let stock of stocksInformation.stocks ?? []) {
        let symbol = stock.symbol;
        if (stock.actuals.length === actualsLength) {
            stock.actuals.shift()
        };
        let ask = ns.stock.getAskPrice(symbol);
        let bid = ns.stock.getBidPrice(symbol);
        let price = (ask + bid) / 2;
        let spreadRatio = (ask - bid) / (ask + bid);
        let differenceAskPrevious = 0;
        let prevActual = undefined;
        if (stock.actuals.length > 0) {
            prevActual = stock.actuals[stock.actuals.length - 1]
            let prev = prevActual.ask
            differenceAskPrevious = prev === 0 ? 0 : ask / prev
        }
        let forecast = undefined;
        let volatility = undefined;
        if (ns.stock.has4SDataTIXAPI()) {
            forecast = ns.stock.getForecast(stock.symbol);
            volatility = ns.stock.getVolatility(stock.symbol);
        }
        let pointChange = 0;
        if (stock.actuals.length > 0) {
            if (prevActual) {
                if (prevActual.ask < ask) {
                    pointChange = (ask / prevActual.ask) - 1;
                }
                else {
                    pointChange = (prevActual.ask / ask) - 1;
                }
            }
        }

        stock.actuals.push({ ask, bid, price, spreadRatio, differenceAskPrevious, differenceAskBid: ask - bid, forecast, volatility, pointChange, predictedInversion: false });
        if (stock.actuals.length >= foreCastLongWindow) {
            stock.actuals[stock.actuals.length - 1].forecastLongEstimated = getForecastEstimated(ns, stock.actuals.slice(-foreCastLongWindow));
            stock.actuals[stock.actuals.length - 1].volatilityEstimated = getVolatilityEstimated(ns, stock.actuals.slice(-foreCastLongWindow));
        }
        if (stock.actuals.length >= foreCastShortWindow) {
            stock.actuals[stock.actuals.length - 1].forecastShortEstimated = getForecastEstimated(ns, stock.actuals.slice(-foreCastShortWindow));
        }
        let lastActual = stock.actuals[stock.actuals.length - 1];

        if (stock.numberOfStocks > 0) {
            stocksInformation.totalStocksValue += bid * stock.numberOfStocks;
        }
        if (stock.numberOfShorts > 0) {
            stocksInformation.totalStocksValue += (2 * stock.priceBought - ask) * stock.numberOfShorts;
        }
    }

    // sort, most profitable first
    if (stocksInformation.stocks) {
        stocksInformation.stocks.sort((a, b) => {
            const aActuals = a.actuals;
            const bActuals = b.actuals;

            const aExpected = aActuals.length > 0 ? Math.abs(1 - getExpectedIncreaseForStockActual(ns, aActuals[aActuals.length - 1])) : -Infinity;
            const bExpected = bActuals.length > 0 ? Math.abs(1 - getExpectedIncreaseForStockActual(ns, bActuals[bActuals.length - 1])) : -Infinity;

            // Sort in descending order (highest expected return first)
            return bExpected - aExpected;
        });
    }
}

export function checkGetAccess(ns: NS) {
    return ns.stock.purchaseWseAccount() && ns.stock.purchaseTixApi();
}

// buy TIXAPI is possible (and we hase some spare money, i.e. 1.5x the cost as evaluation?)
export function getTIXAPI(ns: NS) {
    if (ns.stock.purchase4SMarketDataTixApi()) {
        return true;
    }

    if (ns.getServerMoneyAvailable('home') >= ns.stock.getConstants().MarketDataTixApi4SCost &&
        ns.getServerMoneyAvailable('home') + stocksInformation.totalStocksValue > ns.stock.getConstants().MarketDataTixApi4SCost * 1.5) {
        return ns.stock.purchase4SMarketDataTixApi();
    }
    else if (ns.getServerMoneyAvailable('home') + stocksInformation.totalStocksValue > ns.stock.getConstants().MarketDataTixApi4SCost * 1.6) {
        ns.tprint('liquidating all stocks and buying 4sMarketDataTixAPI');
        liquidate(ns);
        if (!ns.stock.purchase4SMarketDataTixApi()) {
            ns.tprint('could not buy tixDataAPI after liquidating');
        }
    }


}
export function detectInversions(ns: NS) {

    if (ns.stock.has4SDataTIXAPI()) {
        let inversions = 0;
        for (let stock of stocksInformation.stocks ?? []) {
            if (stock.actuals.length > 1) {
                let current = stock.actuals[stock.actuals.length - 1];
                let previous = stock.actuals[stock.actuals.length - 2];
                // flipping switches forecast from > 0.5 to < 0.5, so easy to verify if it happened
                if (current.forecast && previous.forecast && (current.forecast > 0.5) !== (previous.forecast > 0.5)) {
                    inversions++;
                }
            }
        }
        if (inversions > 5) {
            if (stocksInformation.inversionTick && stocksInformation.currentTick !== stocksInformation.inversionTick) {
                ns.tprint('inversions', inversions)
                ns.tprint('found tix data api tick on ', stocksInformation.currentTick, ' while it was already set to ', stocksInformation.inversionTick)
            }
            stocksInformation.inversionTick = stocksInformation.currentTick;
        }
    }

    let inversions = 0;
    // set current predicted inversions
    for (let stock of stocksInformation.stocks ?? []) {
        if (stock.actuals.length < actualsLength) {
            continue;
        }

        let current = stock.actuals[stock.actuals.length - 1];
        let previous = stock.actuals[stock.actuals.length - foreCastLongWindow - 1];

        // if the forecast has switched, and the sum is still close to one then assume an inversion happened
        if (current.forecastLongEstimated && previous.forecastLongEstimated) {
            if (current.forecastLongEstimated >= 0.5 + inversionTolerance && previous.forecastLongEstimated <= 0.5 - inversionTolerance) {
                inversions++;
                current.predictedInversion = true;
            }
            else if (current.forecastLongEstimated <= 0.5 - inversionTolerance && previous.forecastLongEstimated >= 0.5 + inversionTolerance) {
                inversions++;
                current.predictedInversion = true;
            }
        }
    }
    // debug variable
    inversionsBasedOnPrediction = inversions;

    // add inversions to the overal count
    stocksInformation.overalActual[stocksInformation.overalActual.length - 1].predictedInversions = stocksInformation.overalActual[stocksInformation.overalActual.length - 1].predictedInversions + inversions;
    // cycles completed is only updated at the end, need at least 2 previous cycle to have a comparisom for all ticks
    // first cycle is used to make a first forecast for all entries
    // then a second cycle is needed to have a forecast to compare it with
    // only in the third cycle then can we start counting inversions
    if (stocksInformation.numberOfCyclesCompleted >= 2 && stocksInformation.overalActual.length >= foreCastLongWindow && stocksInformation.currentTick === ticksForInversion) {

        let highestIndex = 0;
        let highestInversions = 0;
        // start at 1 because the the value of the last value of previous cycle is also stored,
        for (let i = 1; i < stocksInformation.overalActual.length; i++) {
            if (stocksInformation.overalActual[i].predictedInversions > highestInversions) {
                highestInversions = stocksInformation.overalActual[i].predictedInversions;
                highestIndex = i;
            }
        }

        let highestInversionsAverage = highestInversions / (stocksInformation.numberOfCyclesCompleted - 1);
        currentMaxInversionsAverage = highestInversionsAverage; // debug 
        inversionsMaxCycleIndex = highestIndex; // debug
        let inversionTicksAgo = stocksInformation.overalActual.length - 1 - highestIndex + foreCastLongWindow;
        // first full cycle has no predictions

        let newPredictionTick = stocksInformation.currentTick - inversionTicksAgo;
        if (newPredictionTick < 1) {
            newPredictionTick += ticksForInversion;
        }

        if (!stocksInformation.inversionTickPredicted) {
            ns.tprint('setting initial predicted flip tick to ', newPredictionTick);
            stocksInformation.inversionTickPredicted = newPredictionTick;
        }
        else {
            if (stocksInformation.inversionTickPredicted !== newPredictionTick) {
                ns.tprint('current predicted flip tick is ', stocksInformation.inversionTickPredicted, ' updating to tick ', newPredictionTick)
                stocksInformation.inversionTickPredicted = newPredictionTick;
            }
        }

    }
}

export function sellStocks(ns: NS) {

    let inversionTick = stocksInformation.inversionTick ?? stocksInformation.inversionTickPredicted;
    if (!inversionTick) {
        return;
    }
    let ticksAfterLastInversionTick = stocksInformation.currentTick - inversionTick;
    if (ticksAfterLastInversionTick < 1) {
        ticksAfterLastInversionTick += ticksForInversion;
    }
    if (ticksAfterLastInversionTick < foreCastShortWindow) {
        return;
    }
    for (let stock of stocksInformation.stocks ?? []) {
        if ((stock.numberOfStocks === 0 && stock.numberOfShorts === 0) || stock.actuals.length < actualsLength) {
            continue;
        }

        let lastActual = stock.actuals[stock.actuals.length - 1];
        let forecast = lastActual.forecast;
        if (!forecast) {
            forecast = lastActual.forecastShortEstimated;
        }

        // assuming a stock has been bought when it is expected to increase, we should only own stocks with forecast>0.5
        // as the probability to invert is 0.45, is is expected for a stock NOT to flip, hence normally holding should increase profit

        // but if the probability has been determined to drop below 0.50, then just sell all
        if (forecast) {
            let isLong = stock.numberOfStocks > 0; // for now assuming we only ever buy one type
            if ((isLong && forecast < 0.5) || (!isLong && forecast > 0.5)) {
                // I think we need to pass the symbol because other wise it will not pass by reference?
                sellStock(ns, stock.symbol);
            }
        }
    }
}

export function sellStock(ns: NS, symbol: string) {
    let stock = stocksInformation.stocks?.find((stock) => stock.symbol === symbol);
    if (stock) {
        let isLong = stock.numberOfStocks > 0; // for now assume only a single type of stocl
        if (!isLong) {
            let ask = ns.stock.getAskPrice(symbol)
            let profit = stock.priceBought - ask;
            if (stock.numberOfShorts * (stock.priceBought - profit) - thresholdToGain < 0) {
                ns.tprint('not selling short ', symbol, ' the short was bought for ', stock.priceBought, ' and current ask is ', ask);
            }
        }
        let price = isLong ? ns.stock.sellStock(stock.symbol, stock.numberOfStocks) : ns.stock.sellShort(stock.symbol, stock.numberOfShorts);
        if (price > 0) {
            let numberOfStocks = isLong ? stock.numberOfStocks : stock.numberOfShorts;
            let moneyEarned = isLong ? price * numberOfStocks : (stock.priceBought - price) * numberOfStocks
            let moneyPerShare = isLong ? price : (2 * stock.priceBought - price);
            let expectedProfit = isLong ? stock.expectedSellPrice - stock.priceBought : stock.priceBought - stock.expectedSellPrice
            stocksInformation.totalStocksValue -= moneyEarned;
            let profit = (moneyPerShare - stock.priceBought) * numberOfStocks - 2 * transactionFee;
            if (isLong) {
                stocksInformation.totalLongEarned = stocksInformation.totalLongEarned + profit;
            }
            else {
                stocksInformation.totalShortEarned = stocksInformation.totalShortEarned + profit;
            }
            ns.write(logFile, `selling ${stock.symbol} ${isLong ? 'Long' : 'Short'} for ${price} amount ${numberOfStocks}  profit per share: ${moneyPerShare - stock.priceBought} expected: ${expectedProfit} \n`, 'a');
            stock.priceBought = 0;
            stock.numberOfStocks = 0;
            stock.numberOfShorts = 0;
        }
        else {
            ns.tprint('could not sell ', stock.symbol);
        }
    }
}

export function liquidate(ns: NS) {
    for (let stock of stocksInformation.stocks ?? []) {
        sellStock(ns, stock.symbol);
    }
}

export function buyStocks(ns: NS) {
    // only buy if:
    // inversionTick is known (i.e. we know the inversion AND forecasts)
    // the predictedInversionTick is know, and we are after the short forecast window (so we have a decent predicted forecast)
    let inversionTick = stocksInformation.inversionTick ?? stocksInformation.inversionTickPredicted;
    if (!inversionTick) {
        return;
    }
    let ticksAfterLastInversionTick = stocksInformation.currentTick - inversionTick;
    if (ticksAfterLastInversionTick < 1) {
        ticksAfterLastInversionTick += ticksForInversion;
    }
    if (!stocksInformation.inversionTick && ticksAfterLastInversionTick < foreCastShortWindow) {
        return;
    }


    let moneyAvailable = ns.getServerMoneyAvailable('home');
    // we do not want to spend all our money one one stock, but is fine to spend all money if the value is already in other stocks
    let startingMoney = ns.getServerMoneyAvailable('home') + stocksInformation.totalStocksValue;
    // with TixAPI we know forecast is accurate, so we can immidiately buy after the inversion
    // Otherwise, wait till some ticks are passed such that we have an accurate forecast
    if ((ns.stock.has4SDataTIXAPI() && stocksInformation.inversionTick)
        || stocksInformation.inversionTickPredicted) {

        let ticksToGrow = inversionTick - stocksInformation.currentTick;
        if (ticksToGrow < 0) {
            ticksToGrow += ticksForInversion;
        }

        for (let stock of stocksInformation.stocks ?? []) {
            if (stock.numberOfStocks + stock.numberOfShorts > 0 || (stock.actuals.length === 0 || (stock.actuals.length < actualsLength && !stocksInformation.inversionTick))) {
                continue;
            }

            let isEstimation = false;
            // get expectedGain per stock
            const lastActual = stock.actuals[stock.actuals.length - 1];
            let forecast = lastActual.forecast;
            if (!forecast) {
                forecast = lastActual.forecastShortEstimated;
                isEstimation = true;
            }
            let volatility = lastActual.volatility;
            if (!volatility) {
                volatility = lastActual.volatilityEstimated;
            }
            if (!forecast || !volatility) {
                continue;
            }
            let isLong = forecast > 0.50; // logic for buying long/short is rather similar
            if (isEstimation && ((isLong && forecast < predictedLongBuyFrom)
                || (!isLong && forecast > predictedShortBuyFrom))) {
                // intended to only buy if we are rather sure of the forecast, note that even with a small profit,
                // with a small profit the growth can still be a lot so that does not fully catch all false positives
                continue;
            }
            let expectedPrice = getExpectedPrice(ns, lastActual.price, forecast, volatility, ticksToGrow, isEstimation);
            // for shorts we pay current price and then receive the initial price + difference in boughtPrice and current price
            let expectedSellPrice = isLong ? expectedPrice * (1 - lastActual.spreadRatio) : expectedPrice * (1 + lastActual.spreadRatio);
            let buyPrice = isLong ? lastActual.ask : lastActual.bid;
            let profitPerShare = isLong ? expectedSellPrice - buyPrice : buyPrice - expectedPrice;
            if (profitPerShare > 0) {
                // short buy now for // buy short for bid sell for ask
                let maxTotalMoney = Math.floor(startingMoney * maxRatioPerTransaction / buyPrice);
                let maxInTransation = Math.floor(maxMoneyPerTransaction / buyPrice);
                let maxAvailable = ns.stock.getMaxShares(stock.symbol);
                let maxCurrentMoney = Math.floor((moneyAvailable - transactionFee) / buyPrice);
                let stocksToBuy = Math.min(maxTotalMoney, maxInTransation, maxAvailable, maxCurrentMoney);
                if (stocksToBuy * profitPerShare > thresholdToGain) {
                    let price = isLong ? ns.stock.buyStock(stock.symbol, stocksToBuy) : ns.stock.buyShort(stock.symbol, stocksToBuy);
                    if (price > 0) {
                        if (isLong) {
                            stock.numberOfStocks = stocksToBuy;
                        }
                        else {
                            stock.numberOfShorts = stocksToBuy;
                        }
                        stock.priceBought = price;
                        stock.expectedSellPrice = expectedSellPrice;
                        stocksInformation.totalStocksValue += price * stocksToBuy;
                        ns.write(logFile, `buying ${isLong ? 'Long' : 'Short'} ${stock.symbol}  for ${price} amount ${stocksToBuy}  \n`, 'a');
                        moneyAvailable -= (price * stocksToBuy + transactionFee);
                    }
                    else {
                        ns.tprint(`could not buy ${isLong ? 'Long' : 'Short'} ${stock.symbol} amount ${stocksToBuy}`);
                    }

                }
            }
        }
    }
}


export function getExpectedPrice(ns: NS, price: number, forecast: number, volatility: number, cycles: number, isEstimation: boolean) {

    if (isEstimation) {
        let adjustment = forecast > 0.5 ? adjustedForecastForLong : adjustedForecastShort
        forecast = (1 - adjustment) * forecast + adjustment * 0.5
    }
    let expectedIncrease = getExpectedIncrease(ns, forecast, volatility);

    if (isEstimation) {
        expectedIncrease = expectedIncrease / (1 + volatility / 6);
    }
    let expectedValue = price * Math.pow(expectedIncrease, cycles)

    return expectedValue;
}

export function getExpectedIncreaseForStockActual(ns: NS, stockActual: StockActual) {
    let forecast = stockActual.forecast;
    if (!forecast) {
        forecast = stockActual.forecastShortEstimated;
    }
    let volatility = stockActual.volatility;
    if (!volatility) {
        volatility = stockActual.volatilityEstimated;
    }
    if (!forecast || !volatility) {
        return 1;
    }
    return getExpectedIncrease(ns, forecast, volatility);
}

export function getExpectedIncrease(ns: NS, forecast: number, volatility: number) {

    let expectedIncrease = forecast * (1 + volatility / 2) + (1 - forecast) * (1 - volatility / 2);
    return expectedIncrease
}

export function hackStocks(ns: NS) {

    if (!stocksInformation.stocks) {
        return
    }

    let bestStock = undefined;
    let highest = 0;
    for (let i = 0; i < stocksInformation.stocks.length; i++) {

        let stock = stocksInformation.stocks[i];
        if (canHackStock(ns, stock) && (stock.numberOfStocks > 0 || stock.numberOfShorts)) {
            if (!bestStock || stock.numberOfStocks * stock.priceBought > highest) {
                bestStock = stock;
                highest = stock.numberOfShorts * stock.priceBought;
            }
        }
    }
    if (bestStock) {
        hackStock(ns, bestStock);
    }
    return;
}
const locations = [{ "location": "ECorp", "sym": "ECP", "server": "ecorp" }, { "location": "MegaCorp", "sym": "MGCP", "server": "megacorp" }, { "location": "Blade Industries", "sym": "BLD", "server": "blade" }, { "location": "Clarke Incorporated", "sym": "CLRK", "server": "clarkinc" }, { "location": "OmniTek Incorporated", "sym": "OMTK", "server": "omnitek" }, { "location": "Four Sigma", "sym": "FSIG", "server": "4sigma" }, { "location": "KuaiGong International", "sym": "KGI", "server": "kuai-gong" }, { "location": "Fulcrum Technologies", "sym": "FLCM", "server": "fulcrumassets" }, { "location": "Storm Technologies", "sym": "STM", "server": "stormtech" }, { "location": "DefComm", "sym": "DCOMM", "server": "defcomm" }, { "location": "Helios Labs", "sym": "HLS", "server": "helios" }, { "location": "VitaLife", "sym": "VITA", "server": "vitalife" }, { "location": "Icarus Microsystems", "sym": "ICRS", "server": "icarus" }, { "location": "Universal Energy", "sym": "UNV", "server": "univ-energy" }, { "location": "AeroCorp", "sym": "AERO", "server": "aerocorp" }, { "location": "Omnia Cybersystems", "sym": "OMN", "server": "omnia" }, { "location": "Solaris Space Systems", "sym": "SLRS", "server": "solaris" }, { "location": "Global Pharmaceuticals", "sym": "GPH", "server": "global-pharm" }, { "location": "Nova Medical", "sym": "NVMD", "server": "nova-med" }, { "location": "LexoCorp", "sym": "LXO", "server": "lexo-corp" }, { "location": "Rho Construction", "sym": "RHOC", "server": "rho-construction" }, { "location": "Alpha Enterprises", "sym": "APHE", "server": "alpha-ent" }, { "location": "SysCore Securities", "sym": "SYSC", "server": "syscore" }, { "location": "CompuTek", "sym": "CTK", "server": "computek" }, { "location": "NetLink Technologies", "sym": "NTLK", "server": "netlink" }, { "location": "Omega Software", "sym": "OMGA", "server": "omega-net" }, { "location": "FoodNStuff", "sym": "FNS", "server": "foodnstuff" }, { "location": "Joe's Guns", "sym": "JGN", "server": "joesguns" }, { "location": "Sigma Cosmetics", "sym": "SGC", "server": "sigma-cosmetics" }, { "location": "Catalyst Ventures", "sym": "CTYS", "server": "catalyst" }, { "location": "Microdyne Technologies", "sym": "MDYN", "server": "microdyne" }, { "location": "Titan Laboratories", "sym": "TITN", "server": "titan-labs" }]


export function canHackStock(ns: NS, stock: Stock) {
    serverToHack = locations.find((location) => location.sym === stock.symbol)?.server;
    if (!serverToHack) {
        return false
    }
    return ns.hasRootAccess(serverToHack) && (ns.getWeakenTime(serverToHack) < 1000 * 60 * 5);
}


// from https://github.com/xxxsinx/bitburner/blob/main/symbol-servers.txt

export function hackStock(ns: NS, stock: Stock) {
    let scriptName = 'scripts/batch-manager-loop.ts';
    if (ns.scriptRunning(scriptName, 'home')) {
        return;
    }
    else {
        serverToHack = locations.find((location) => location.sym === stock.symbol)?.server;
        if (!!serverToHack) {
            stockToHack = stock;
            ns.run(scriptName,
                1,
                serverToHack,
                true, // runOnce
                false, // doWarmup
                stock.numberOfStocks > 0 //isLong 
            )
        }
    }

}

// returns an estimated forecast (= probability to go up or down) for the StockActual
export function getForecastEstimated(ns: NS, stockActuals: StockActual[]) {
    let amountPositive = stockActuals.reduce((prev, stockActual) => (prev + (stockActual.differenceAskPrevious > 1 ? 1 : 0)), 0);
    let ratio = amountPositive / stockActuals.length;
    return ratio;
}

// estimated volatility is simply the max observed change
export function getVolatilityEstimated(ns: NS, stockActuals: StockActual[]) {
    let max = stockActuals.reduce((prev, stockActual) => Math.max(stockActual.pointChange, prev), 0);
    return max;
}


export function getAverage(ns: NS, n: number[]) {
    let sum = n.reduce((prev, c) => prev + c, 0);
    let average = sum / n.length;
    return average;
}

export function updateHUD(ns: NS) {
    let doc = eval('document');
    let hook0 = doc.getElementById('overview-extra-hook-0');
    let hook1 = doc.getElementById('overview-extra-hook-1');

    let hook2 = doc.getElementById('overview-extra-hook-2');

    let headers = [];
    let values = [];

    headers.push('Valuation');
    headers.push('Long earned');
    headers.push('Short earned');
    headers.push('Completed cycles:')
    headers.push('Tick');


    if (stocksInformation.inversionTick) {
        headers.push('Inversion Tick');
    }
    else {
        headers.push('Predicted Inversion Tick');
    }

    values.push(ns.formatNumber(stocksInformation.totalStocksValue));
    values.push(ns.formatNumber(stocksInformation.totalLongEarned));
    values.push(ns.formatNumber(stocksInformation.totalShortEarned));
    values.push(stocksInformation.numberOfCyclesCompleted);
    values.push(stocksInformation.currentTick);
    values.push(stocksInformation.inversionTick ?? stocksInformation.inversionTickPredicted ?? -1);


    // debug???
    let debug = true;
    if (stocksInformation.stocks && debug) {
        headers.push('predicted inversion tick');
        values.push(stocksInformation.inversionTickPredicted ?? -1);
        headers.push(' predicted inversions');
        values.push(inversionsBasedOnPrediction)
        /*headers.push('max observed average (index)');
        values.push(`${ns.formatNumber(currentMaxInversionsAverage)} (${inversionsMaxCycleIndex})`);*/
        headers.push('stock to hack');
        values.push(`${stockToHack.symbol ?? 'n/a'} ${serverToHack ?? ''}`);
        if (stockToHack && stockToHack.actuals && stockToHack.actuals.length > 0) {
            headers.push('forecast');
            // push forecast or predicted forecast (p) to indicate its a prediction!
            values.push(`${stockToHack.actuals[stockToHack.actuals.length - 1].forecast
                ?? stockToHack.actuals[stockToHack.actuals.length - 1].forecastShortEstimated} ${stockToHack.actuals[stockToHack.actuals.length - 1].forecast ? '' : '(p)'}`);
        }

        function pushStockInformation(stock: Stock) {
            let lastActual = stock.actuals[stock.actuals.length - 1];
            headers.push('Stock');
            values.push(stock.symbol);
            for (let i = 50; i < actualsLength; i++) {
                {
                    headers.push('p,ef');
                    values.push(`${stock.actuals[i].differenceAskPrevious > 1 ? 1 : 0} - ${stock.actuals[i].forecastShortEstimated}`);
                }
            }
        }

        if (stocksInformation.overalActual.length === actualsLength) {
            //pushStockInformation(stocksInformation.stocks[0]);
        }

        let numberOfForecasstsCorrect = 0;
        for (let i = 0; i < stocksInformation.stocks.length; i++) {
            let stock = stocksInformation.stocks[i] as Stock;
            let lastActual = stock.actuals[stock.actuals.length - 1];
            if (lastActual.forecastShortEstimated && lastActual.forecast && (lastActual.forecast > 0.5) === (lastActual.forecastShortEstimated > 0.5)) {
                numberOfForecasstsCorrect++;
            }
        }
        headers.push('Forecasts correct');
        if (!numberOfForecasstsCorrect) {
            values.push('-1');
        }
        else {
            values.push(`${numberOfForecasstsCorrect} / ${stocksInformation.stocks.length}`);
        }

    }

    hook0.innerText = headers.join(' \n');
    hook1.innerText = values.join(' \n');
}

export function debug(ns: NS) {

}
