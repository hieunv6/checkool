const EXCHANGE_RATE_URL = "https://api.exchangerate.host/latest?base=USD&symbols=VND";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const EARLIEST_MARKET_DATE = "2017-08-17";
export const FALLBACK_USD_VND = 25400;

const priceCache = new Map();
const currentPriceCache = new Map();
let topCoinsCache = null;
let exchangeRateCache = null;

export function normalizeDateInput(value) {
  if (!value) return "";
  return value instanceof Date ? toDateKey(value) : String(value).slice(0, 10);
}

export function toDateKey(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function parseDateKey(dateKey) {
  const [year, month, day] = normalizeDateInput(dateKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * ONE_DAY_MS);
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addMonthsClamped(date, months, anchorDay) {
  const nextMonthStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)
  );
  const day = Math.min(anchorDay, daysInMonth(nextMonthStart.getUTCFullYear(), nextMonthStart.getUTCMonth()));
  return new Date(Date.UTC(nextMonthStart.getUTCFullYear(), nextMonthStart.getUTCMonth(), day));
}

export function todayKey() {
  return toDateKey(new Date());
}

export function compareDateKeys(a, b) {
  return normalizeDateInput(a).localeCompare(normalizeDateInput(b));
}

export function clampStartDate(startDate) {
  const start = normalizeDateInput(startDate);
  return compareDateKeys(start, EARLIEST_MARKET_DATE) < 0 ? EARLIEST_MARKET_DATE : start;
}

export function generatePurchaseDates(startDate, endDate, frequency) {
  const startKey = normalizeDateInput(startDate);
  const endKey = normalizeDateInput(endDate);
  if (!startKey || !endKey || compareDateKeys(startKey, endKey) > 0) return [];

  const dates = [];
  let cursor = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  const anchorDay = cursor.getUTCDate();
  const stepDays = { daily: 1, weekly: 7, biweekly: 14 }[frequency];

  while (cursor.getTime() <= end.getTime()) {
    dates.push(toDateKey(cursor));
    cursor = stepDays
      ? addDays(cursor, stepDays)
      : addMonthsClamped(cursor, 1, anchorDay);
  }

  return dates;
}

function shouldRebalance(date, frequency, lastRebalanceDate) {
  if (!frequency || frequency === "never" || date === lastRebalanceDate) return false;
  if (!lastRebalanceDate) return true;

  const current = parseDateKey(date);
  const previous = parseDateKey(lastRebalanceDate);
  const monthDelta =
    (current.getUTCFullYear() - previous.getUTCFullYear()) * 12 +
    current.getUTCMonth() -
    previous.getUTCMonth();

  if (frequency === "monthly") return monthDelta >= 1;
  if (frequency === "quarterly") return monthDelta >= 3;
  if (frequency === "yearly") return current.getUTCFullYear() > previous.getUTCFullYear();
  return false;
}

async function fetchWithRetry(url, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status === 429 && attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export async function fetchTopCoins() {
  if (topCoinsCache) return topCoinsCache;
  const data = await fetchWithRetry("/api/coins/top");
  const coins = Array.isArray(data?.coins) ? data.coins : [];
  if (coins.length === 0) {
    throw new Error("Không lấy được danh sách coin.");
  }
  topCoinsCache = coins;
  return coins;
}

export async function fetchHistoricalPrices(coinId, startDate, endDate) {
  const startKey = clampStartDate(startDate);
  const endKey = normalizeDateInput(endDate);
  const cacheKey = `${coinId}:${startKey}:${endKey}`;
  if (priceCache.has(cacheKey)) return priceCache.get(cacheKey);

  const params = new URLSearchParams({ start: startKey, end: endKey });
  const data = await fetchWithRetry(`/api/coins/${encodeURIComponent(coinId)}/prices?${params.toString()}`);
  const prices = Array.isArray(data?.prices) ? data.prices : [];

  const deduped = Array.from(new Map(prices.map((price) => [price.date, price])).values())
    .filter((price) => compareDateKeys(price.date, startKey) >= 0 && compareDateKeys(price.date, endKey) <= 0)
    .map((price) => ({ date: normalizeDateInput(price.date), close: Number(price.close) }))
    .filter((price) => Number.isFinite(price.close) && price.close > 0)
    .sort((a, b) => compareDateKeys(a.date, b.date));

  if (deduped.length === 0) {
    throw new Error("Không lấy được dữ liệu giá coin.");
  }

  priceCache.set(cacheKey, deduped);
  return deduped;
}

export async function fetchCurrentPrice(coinId) {
  if (currentPriceCache.has(coinId)) return currentPriceCache.get(coinId);
  const data = await fetchWithRetry(`/api/coins/${encodeURIComponent(coinId)}/current`);
  const price = Number(data.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Giá hiện tại không hợp lệ.");
  }
  currentPriceCache.set(coinId, price);
  return price;
}

export async function fetchUsdVndRate() {
  if (exchangeRateCache) return exchangeRateCache;
  try {
    const data = await fetchWithRetry(EXCHANGE_RATE_URL, 2);
    const rate = Number(data?.rates?.VND);
    exchangeRateCache = Number.isFinite(rate) && rate > 0 ? rate : FALLBACK_USD_VND;
  } catch {
    exchangeRateCache = FALLBACK_USD_VND;
  }
  return exchangeRateCache;
}

export function getPriceOnOrBefore(prices, date) {
  const dateKey = normalizeDateInput(date);
  let candidate = null;
  for (const price of prices) {
    if (compareDateKeys(price.date, dateKey) <= 0) {
      candidate = price;
    } else {
      break;
    }
  }
  return candidate;
}

export function simulateDCA(prices, purchaseDates, amountPerPurchase, currentPrice, feePercent = 0) {
  const amount = Number(amountPerPurchase);
  const feeRate = Number(feePercent) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Số tiền mỗi lần mua phải lớn hơn 0.");
  }
  if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate >= 1) {
    throw new Error("Phí giao dịch phải từ 0 đến dưới 100%.");
  }

  let totalInvested = 0;
  let totalBTC = 0;
  let buyFees = 0;
  const snapshots = [];

  for (const date of purchaseDates) {
    const price = getPriceOnOrBefore(prices, date);
    if (!price) continue;

    const fee = amount * feeRate;
    const netAmount = amount - fee;
    const btcBought = netAmount / price.close;
    totalBTC += btcBought;
    totalInvested += amount;
    buyFees += fee;

    const grossPortfolioValue = totalBTC * price.close;
    const sellFee = grossPortfolioValue * feeRate;
    snapshots.push({
      date,
      price: price.close,
      amount,
      fee,
      netAmount,
      coinBought: btcBought,
      totalCoin: totalBTC,
      totalInvested,
      portfolioValue: grossPortfolioValue - sellFee
    });
  }

  if (totalBTC <= 0 || totalInvested <= 0) {
    throw new Error("Không có giao dịch hợp lệ trong khoảng thời gian đã chọn.");
  }

  const grossCurrentValue = totalBTC * currentPrice;
  const sellFee = grossCurrentValue * feeRate;
  const currentValue = grossCurrentValue - sellFee;
  const pnlUSD = currentValue - totalInvested;

  return {
    totalInvested,
    totalBTC,
    avgCost: totalInvested / totalBTC,
    buyFees,
    sellFee,
    totalFees: buyFees + sellFee,
    grossCurrentValue,
    currentValue,
    pnlUSD,
    pnlPercent: (pnlUSD / totalInvested) * 100,
    snapshots
  };
}

export function simulateLumpSum(prices, totalInvested, startDate, currentPrice, feePercent = 0) {
  const feeRate = Number(feePercent) / 100;
  if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate >= 1) {
    throw new Error("Phí giao dịch phải từ 0 đến dưới 100%.");
  }

  const startPrice = getPriceOnOrBefore(prices, startDate) || prices[0];
  if (!startPrice) {
    throw new Error("Không có giá coin tại ngày bắt đầu.");
  }

  const buyFee = totalInvested * feeRate;
  const btc = (totalInvested - buyFee) / startPrice.close;
  const grossValue = btc * currentPrice;
  const sellFee = grossValue * feeRate;
  const value = grossValue - sellFee;
  const pnlUSD = value - totalInvested;
  return {
    invested: totalInvested,
    btc,
    startPrice: startPrice.close,
    buyFee,
    sellFee,
    totalFees: buyFee + sellFee,
    grossValue,
    value,
    pnlUSD,
    pnlPercent: totalInvested > 0 ? (pnlUSD / totalInvested) * 100 : 0
  };
}

export function simulatePortfolioDCA(assets, purchaseDates, amountPerPurchase, feePercent = 0, options = {}) {
  const amount = Number(amountPerPurchase);
  const feeRate = Number(feePercent) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Số tiền mỗi lần mua phải lớn hơn 0.");
  }
  if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate >= 1) {
    throw new Error("Phí giao dịch phải từ 0 đến dưới 100%.");
  }
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error("Danh mục phải có ít nhất một coin.");
  }

  const normalizedAssets = assets.map((asset) => ({
    ...asset,
    allocationPercent: Number(asset.allocationPercent)
  }));
  const allocationTotal = normalizedAssets.reduce((sum, asset) => sum + asset.allocationPercent, 0);
  if (!Number.isFinite(allocationTotal) || Math.abs(allocationTotal - 100) > 0.01) {
    throw new Error("Tổng phân bổ danh mục phải bằng 100%.");
  }

  const holdings = new Map(normalizedAssets.map((asset) => [asset.coinId, 0]));
  const totalsByCoin = new Map(
    normalizedAssets.map((asset) => [
      asset.coinId,
      {
        coinId: asset.coinId,
        symbol: asset.symbol,
        name: asset.name,
        totalCoin: 0,
        totalInvested: 0,
        buyFees: 0,
        currentPrice: Number(asset.currentPrice)
      }
    ])
  );
  let totalInvested = 0;
  let buyFees = 0;
  let rebalanceFees = 0;
  const snapshots = [];
  const orders = [];
  const rebalances = [];
  let lastRebalanceDate = null;

  for (const date of purchaseDates) {
    const dayOrders = [];
    const pricesByCoin = new Map();

    for (const asset of normalizedAssets) {
      const price = getPriceOnOrBefore(asset.prices, date);
      if (!price) continue;
      pricesByCoin.set(asset.coinId, price.close);

      const allocatedAmount = amount * (asset.allocationPercent / 100);
      const fee = allocatedAmount * feeRate;
      const netAmount = allocatedAmount - fee;
      const coinBought = netAmount / price.close;
      const totalCoin = (holdings.get(asset.coinId) || 0) + coinBought;
      const coinTotals = totalsByCoin.get(asset.coinId);

      holdings.set(asset.coinId, totalCoin);
      coinTotals.totalCoin = totalCoin;
      coinTotals.totalInvested += allocatedAmount;
      coinTotals.buyFees += fee;
      totalInvested += allocatedAmount;
      buyFees += fee;

      dayOrders.push({
        date,
        coinId: asset.coinId,
        symbol: asset.symbol,
        name: asset.name,
        price: price.close,
        amount: allocatedAmount,
        fee,
        netAmount,
        coinBought,
        totalCoin
      });
    }

    if (dayOrders.length === 0) continue;

    let grossPortfolioValue = normalizedAssets.reduce((sum, asset) => {
      const price = pricesByCoin.get(asset.coinId) || getPriceOnOrBefore(asset.prices, date)?.close || 0;
      return sum + (holdings.get(asset.coinId) || 0) * price;
    }, 0);

    let rebalanceFee = 0;
    if (shouldRebalance(date, options.rebalanceFrequency, lastRebalanceDate) && grossPortfolioValue > 0) {
      const turnover = normalizedAssets.reduce((sum, asset) => {
        const price = pricesByCoin.get(asset.coinId) || getPriceOnOrBefore(asset.prices, date)?.close || 0;
        const currentValue = (holdings.get(asset.coinId) || 0) * price;
        const targetValue = grossPortfolioValue * (asset.allocationPercent / 100);
        return sum + Math.abs(targetValue - currentValue);
      }, 0);

      rebalanceFee = turnover * feeRate;
      const netPortfolioValue = grossPortfolioValue - rebalanceFee;
      for (const asset of normalizedAssets) {
        const price = pricesByCoin.get(asset.coinId) || getPriceOnOrBefore(asset.prices, date)?.close || 0;
        const targetValue = netPortfolioValue * (asset.allocationPercent / 100);
        holdings.set(asset.coinId, price > 0 ? targetValue / price : 0);
        const coinTotals = totalsByCoin.get(asset.coinId);
        coinTotals.totalCoin = holdings.get(asset.coinId) || 0;
      }
      grossPortfolioValue = netPortfolioValue;
      rebalanceFees += rebalanceFee;
      lastRebalanceDate = date;
      rebalances.push({
        date,
        turnover,
        fee: rebalanceFee,
        portfolioValue: netPortfolioValue
      });
    }

    const sellFee = grossPortfolioValue * feeRate;

    orders.push(...dayOrders);
    snapshots.push({
      date,
      amount,
      fee: dayOrders.reduce((sum, order) => sum + order.fee, 0),
      rebalanceFee,
      totalInvested,
      portfolioValue: grossPortfolioValue - sellFee,
      orders: dayOrders
    });
  }

  if (totalInvested <= 0) {
    throw new Error("Không có giao dịch hợp lệ trong khoảng thời gian đã chọn.");
  }

  const assetsResult = Array.from(totalsByCoin.values()).map((asset) => {
    const grossCurrentValue = asset.totalCoin * asset.currentPrice;
    const sellFee = grossCurrentValue * feeRate;
    const currentValue = grossCurrentValue - sellFee;
    const pnlUSD = currentValue - asset.totalInvested;
    return {
      ...asset,
      sellFee,
      totalFees: asset.buyFees + sellFee,
      grossCurrentValue,
      currentValue,
      pnlUSD,
      pnlPercent: asset.totalInvested > 0 ? (pnlUSD / asset.totalInvested) * 100 : 0,
      avgCost: asset.totalCoin > 0 ? asset.totalInvested / asset.totalCoin : 0
    };
  });

  const grossCurrentValue = assetsResult.reduce((sum, asset) => sum + asset.grossCurrentValue, 0);
  const sellFee = grossCurrentValue * feeRate;
  const currentValue = grossCurrentValue - sellFee;
  const pnlUSD = currentValue - totalInvested;

  return {
    totalInvested,
    buyFees,
    rebalanceFees,
    sellFee,
    totalFees: buyFees + rebalanceFees + sellFee,
    grossCurrentValue,
    currentValue,
    pnlUSD,
    pnlPercent: (pnlUSD / totalInvested) * 100,
    assets: assetsResult,
    snapshots,
    orders,
    rebalances
  };
}

export function simulatePortfolioLumpSum(assets, totalInvested, startDate, feePercent = 0) {
  const feeRate = Number(feePercent) / 100;
  if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate >= 1) {
    throw new Error("Phí giao dịch phải từ 0 đến dưới 100%.");
  }

  const assetsResult = assets.map((asset) => {
    const invested = totalInvested * (Number(asset.allocationPercent) / 100);
    const startPrice = getPriceOnOrBefore(asset.prices, startDate) || asset.prices?.[0];
    if (!startPrice) {
      throw new Error("Không có giá coin tại ngày bắt đầu.");
    }

    const buyFee = invested * feeRate;
    const totalCoin = (invested - buyFee) / startPrice.close;
    const grossCurrentValue = totalCoin * Number(asset.currentPrice);
    const sellFee = grossCurrentValue * feeRate;
    const currentValue = grossCurrentValue - sellFee;
    const pnlUSD = currentValue - invested;

    return {
      coinId: asset.coinId,
      symbol: asset.symbol,
      name: asset.name,
      invested,
      startPrice: startPrice.close,
      totalCoin,
      buyFee,
      sellFee,
      totalFees: buyFee + sellFee,
      grossCurrentValue,
      currentValue,
      pnlUSD,
      pnlPercent: invested > 0 ? (pnlUSD / invested) * 100 : 0
    };
  });

  const buyFees = assetsResult.reduce((sum, asset) => sum + asset.buyFee, 0);
  const sellFee = assetsResult.reduce((sum, asset) => sum + asset.sellFee, 0);
  const value = assetsResult.reduce((sum, asset) => sum + asset.currentValue, 0);
  const pnlUSD = value - totalInvested;

  return {
    invested: totalInvested,
    totalFees: buyFees + sellFee,
    value,
    pnlUSD,
    pnlPercent: totalInvested > 0 ? (pnlUSD / totalInvested) * 100 : 0,
    assets: assetsResult
  };
}

export function calculateYearlyCagr(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return [];

  const firstDate = new Date(`${snapshots[0].date}T00:00:00Z`);
  const lastSnapshotByYear = new Map();

  for (const snapshot of snapshots) {
    const year = snapshot.date.slice(0, 4);
    lastSnapshotByYear.set(year, snapshot);
  }

  let previousSnapshot = null;
  return Array.from(lastSnapshotByYear.entries()).map(([year, snapshot]) => {
    const snapshotDate = new Date(`${snapshot.date}T00:00:00Z`);
    const elapsedDays = Math.max(1, (snapshotDate.getTime() - firstDate.getTime()) / ONE_DAY_MS);
    const elapsedYears = elapsedDays / 365.25;
    const multiple = snapshot.totalInvested > 0 ? snapshot.portfolioValue / snapshot.totalInvested : 0;
    const cagrPercent = multiple > 0 ? (multiple ** (1 / elapsedYears) - 1) * 100 : 0;
    const yoyReturnPercent =
      previousSnapshot && previousSnapshot.portfolioValue > 0
        ? (snapshot.portfolioValue / previousSnapshot.portfolioValue - 1) * 100
        : null;
    previousSnapshot = snapshot;

    return {
      year,
      date: snapshot.date,
      totalInvested: snapshot.totalInvested,
      portfolioValue: snapshot.portfolioValue,
      cagrPercent,
      yoyReturnPercent
    };
  });
}

export function calculateMaxDrawdown(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return { percent: 0, value: 0, peakDate: null, troughDate: null };
  }

  let peak = snapshots[0].portfolioValue;
  let peakDate = snapshots[0].date;
  let maxDrawdown = 0;
  let maxDrawdownValue = 0;
  let troughDate = snapshots[0].date;
  let drawdownPeakDate = peakDate;

  for (const snapshot of snapshots) {
    if (snapshot.portfolioValue > peak) {
      peak = snapshot.portfolioValue;
      peakDate = snapshot.date;
    }

    if (peak <= 0) continue;
    const drawdownValue = peak - snapshot.portfolioValue;
    const drawdownPercent = (drawdownValue / peak) * 100;
    if (drawdownPercent > maxDrawdown) {
      maxDrawdown = drawdownPercent;
      maxDrawdownValue = drawdownValue;
      troughDate = snapshot.date;
      drawdownPeakDate = peakDate;
    }
  }

  return {
    percent: maxDrawdown,
    value: maxDrawdownValue,
    peakDate: drawdownPeakDate,
    troughDate
  };
}

export function calculateYearExtremes(yearlyRows) {
  const rows = yearlyRows.filter((row) => row.yoyReturnPercent !== null);
  if (rows.length === 0) return { best: null, worst: null };

  return rows.reduce(
    (extremes, row) => ({
      best: !extremes.best || row.yoyReturnPercent > extremes.best.yoyReturnPercent ? row : extremes.best,
      worst: !extremes.worst || row.yoyReturnPercent < extremes.worst.yoyReturnPercent ? row : extremes.worst
    }),
    { best: null, worst: null }
  );
}

export function clearPriceCacheForTests() {
  priceCache.clear();
  currentPriceCache.clear();
  topCoinsCache = null;
  exchangeRateCache = null;
}
