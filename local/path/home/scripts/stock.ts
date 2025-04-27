
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

const adjustedForecastForLong = 0.2; // [0.1] used to nudge the forecast to 0.5 when doing estimations, intended to be more sure of investments
const adjustedForecastShort = 0.5; // [0.1] used to nudge the forecast to 0.5 when doing estimations, intended to be more sure of investments
const inversionTolerance = 0.09 // only count an inversion if flip from 0.5+i to 0.5-i.
// as higher probabilities can be observer easier, this gives a better indication
let inversionsBasedOnPrediction = 0; // debug variable to ???
let inversionsMaxCycleIndex = 0; // debug variable, not current max inversions index
let currentMaxInversionsAverage = 0; // debug variable to show max and limit needed for forecast inverstion

type StocksInformation = {
    stocks?: Stock[],
    timeLastTick: number,
    numberOfCyclesCompleted: number,
    totalMoneySpend: number,
    totalMoneyEarned: number,
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
    expectedIncrease: number
    volatilityEstimated?: number, // max volatility, based on the observed value of last 20
    volatility?: number,
    pointChange: number, // change in ask price as compared to previous in points [0.infinity]
    /** the number with which the previous ask price was multipled */
    differenceAskPrevious: number,
    differenceAskBid: number,

}
const actualsLength = ticksForInversion + 1;

let stocksInformation = {} as StocksInformation;
export async function main(ns: NS) {
    if (!checkGetAccess(ns)) {
        await waitAndRestart(ns);
    }
    getTIXAPI(ns);
    let startingMoney = ns.getServerMoneyAvailable('home');
    stocksInformation = JSON.parse(ns.read(file)) as StocksInformation;
    if (!stocksInformation.totalLongEarned) {
        stocksInformation.totalLongEarned = 0;
        stocksInformation.totalShortEarned = 0;
    }
    // 6000ms is normal time between two ticks
    if (!stocksInformation.stocks || stocksInformation.timeLastTick + 9000 < new Date().getTime()) {
        stocksInformation = initialize(ns);
    }
    // update actuals, and sort most profitable first
    updateActuals(ns);
    detectInversions(ns);
    sellStocks(ns);
    buyStocks(ns);

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
    return { stocks: [...stocks], timeLastTick: new Date().getTime(), numberOfCyclesCompleted: 0, totalLongEarned: 0, totalShortEarned: 0, totalMoneySpend: 0, totalMoneyEarned: 0, totalStocksValue: 0, overalActual: [], currentTick: 1 }
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
        previousPredictedIInversions = lost?.predictedInversions ?? 0;
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

        let expectedIncrease = 1; // update after filling estimated!
        stock.actuals.push({ ask, bid, price, spreadRatio, differenceAskPrevious, differenceAskBid: ask - bid, forecast, volatility, pointChange, expectedIncrease, predictedInversion: false });
        if (stock.actuals.length >= foreCastLongWindow) {
            stock.actuals[stock.actuals.length - 1].forecastLongEstimated = getForecastEstimated(ns, stock.actuals.slice(-foreCastLongWindow));
            stock.actuals[stock.actuals.length - 1].volatilityEstimated = getVolatilityEstimated(ns, stock.actuals.slice(-foreCastLongWindow));
        }
        if (stock.actuals.length >= foreCastShortWindow) {
            stock.actuals[stock.actuals.length - 1].forecastShortEstimated = getForecastEstimated(ns, stock.actuals.slice(-foreCastShortWindow));
        }
        let lastActual = stock.actuals[stock.actuals.length - 1];
        lastActual.expectedIncrease = getExpectedIncreaseForStockActual(ns, lastActual);

        if (stock.numberOfStocks > 0) {
            stocksInformation.totalStocksValue += bid * stock.numberOfStocks;
        }
        if (stock.numberOfShorts > 0) {
            stocksInformation.totalStocksValue += (stock.priceBought + stock.priceBought - ask) * stock.numberOfShorts;
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
    if (ns.stock.purchaseTixApi()) {
        return true;
    }

    if (ns.getServerMoneyAvailable('home') >= ns.stock.getConstants().MarketDataTixApi4SCost &&
        ns.getServerMoneyAvailable('home') + stocksInformation.totalStocksValue > ns.stock.getConstants().MarketDataTixApi4SCost * 1.5) {
        return ns.stock.purchase4SMarketDataTixApi();
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
        if (stock.actuals.length < foreCastLongWindow) {
            continue;
        }

        let current = stock.actuals[stock.actuals.length - 1];
        let previous = stock.actuals[stock.actuals.length - foreCastLongWindow];

        // if the forecast has switched, and the sum is still close to one then assume an inversion happened
        if (current.forecastLongEstimated && previous.forecastLongEstimated) {
            if (current.forecastLongEstimated > 0.5 + inversionTolerance && previous.forecastLongEstimated < 0.5 - inversionTolerance) {
                inversions++;
                current.predictedInversion = true;
            }
            else if (current.forecastLongEstimated < 0.5 - inversionTolerance && previous.forecastLongEstimated > 0.5 + inversionTolerance) {
                inversions++;
                current.predictedInversion = true;
            }
        }
    }
    // debug variable
    inversionsBasedOnPrediction = inversions;

    // add inversions to the overal count
    stocksInformation.overalActual[stocksInformation.overalActual.length - 1].predictedInversions = stocksInformation.overalActual[stocksInformation.overalActual.length - 1].predictedInversions + inversions;
    // cycles completed is only updated at the end, need at least 1 previous cycle to have a comparisom for all ticks
    if (stocksInformation.numberOfCyclesCompleted >= 1 && stocksInformation.overalActual.length >= foreCastLongWindow && stocksInformation.currentTick === ticksForInversion) {

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
            ns.tprint('current predicted flip tick is', stocksInformation.inversionTickPredicted, 'updating to tick ', newPredictionTick)
            // only update if the difference is larger than 5, to prevent constant switching
            // note that we might switch between incorrect values, 
            // but if we only switch to the most certain value (based on 1 cycle of observations) then we might get stuck
            stocksInformation.inversionTickPredicted = newPredictionTick;
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
                let price = isLong ? ns.stock.sellStock(stock.symbol, stock.numberOfStocks) : ns.stock.sellShort(stock.symbol, stock.numberOfShorts);
                if (price > 0) {
                    let numberOfStocks = isLong ? stock.numberOfStocks : stock.numberOfShorts;
                    stocksInformation.totalMoneyEarned += price * numberOfStocks - transactionFee;
                    stocksInformation.totalStocksValue -= price * numberOfStocks;
                    let profit = (price - stock.priceBought) * numberOfStocks - 2 * transactionFee;
                    if (isLong) {
                        stocksInformation.totalLongEarned = stocksInformation.totalLongEarned + profit;
                    }
                    else {
                        stocksInformation.totalShortEarned = stocksInformation.totalShortEarned + profit;
                    }
                    ns.write(logFile, `selling ${stock.symbol} ${isLong ? 'Long' : 'Short'} for ${price} amount ${numberOfStocks}  profit per share: ${price - stock.priceBought} expected: ${stock.expectedSellPrice - stock.priceBought} \n`, 'a');
                    stock.priceBought = 0;
                    stock.numberOfStocks = 0;
                    stock.numberOfShorts = 0;
                }
                else {
                    ns.tprint('could not sell ', stock.symbol);
                }
            }
        }
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
    if (ticksAfterLastInversionTick < foreCastShortWindow) {
        return;
    }

    let moneyAvailable = ns.getServerMoneyAvailable('home');
    let startingMoney = ns.getServerMoneyAvailable('home');
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
            let expectedPrice = getExpectedPrice(ns, lastActual.price, forecast, volatility, ticksToGrow, isEstimation);
            // for shorts we pay current price and then receive the initial price + difference in boughtPrice and current price
            let expectedSellPrice = isLong ? expectedPrice * (1 - lastActual.spreadRatio) : (lastActual.bid + lastActual.bid - expectedPrice * (1 + lastActual.spreadRatio))
            let buyPrice = isLong ? lastActual.ask : lastActual.bid
            let profitPerShare = expectedSellPrice - buyPrice;
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
                        stocksInformation.totalMoneySpend += price * stocksToBuy - transactionFee;
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

    headers.push('Spend');
    headers.push('Earned');
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

    values.push(ns.formatNumber(stocksInformation.totalMoneySpend));
    values.push(ns.formatNumber(stocksInformation.totalMoneyEarned));
    values.push(ns.formatNumber(stocksInformation.totalStocksValue));
    values.push(ns.formatNumber(stocksInformation.totalLongEarned));
    values.push(ns.formatNumber(stocksInformation.totalShortEarned));
    values.push(stocksInformation.numberOfCyclesCompleted);
    values.push(stocksInformation.currentTick);
    values.push(stocksInformation.inversionTick ?? stocksInformation.inversionTickPredicted ?? -1);


    // debug???
    let debug = true;
    if (stocksInformation.stocks && debug) {

        headers.push('Inversion tick');
        values.push(stocksInformation.inversionTick ?? -1);
        headers.push('predicted inversion tick');
        values.push(stocksInformation.inversionTickPredicted ?? -1);
        headers.push(' predicted inversions');
        values.push(inversionsBasedOnPrediction)
        /*headers.push('max observed average (index)');
        values.push(`${ns.formatNumber(currentMaxInversionsAverage)} (${inversionsMaxCycleIndex})`);*/


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
