const BINANCE_BASE_URL = "https://api.binance.com/api/v3";
const EXCHANGE_RATE_URL = "https://api.exchangerate.host/latest?base=USD&symbols=VND";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const EARLIEST_BTCUSDT_DATE = "2017-08-17";
export const FALLBACK_USD_VND = 25400;

const priceCache = new Map();
let currentPriceCache = null;
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
  return compareDateKeys(start, EARLIEST_BTCUSDT_DATE) < 0 ? EARLIEST_BTCUSDT_DATE : start;
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

export async function fetchHistoricalPrices(startDate, endDate) {
  const startKey = clampStartDate(startDate);
  const endKey = normalizeDateInput(endDate);
  const cacheKey = `${startKey}:${endKey}`;
  if (priceCache.has(cacheKey)) return priceCache.get(cacheKey);

  const prices = [];
  let cursor = parseDateKey(startKey).getTime();
  const endTime = parseDateKey(endKey).getTime() + ONE_DAY_MS - 1;

  while (cursor <= endTime) {
    const params = new URLSearchParams({
      symbol: "BTCUSDT",
      interval: "1d",
      startTime: String(cursor),
      endTime: String(endTime),
      limit: "1000"
    });
    const rows = await fetchWithRetry(`${BINANCE_BASE_URL}/klines?${params.toString()}`);
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const row of rows) {
      prices.push({
        date: toDateKey(new Date(row[0])),
        close: Number(row[4])
      });
    }

    const nextCursor = Number(rows[rows.length - 1][0]) + ONE_DAY_MS;
    if (nextCursor <= cursor) break;
    cursor = nextCursor;
  }

  const deduped = Array.from(new Map(prices.map((price) => [price.date, price])).values())
    .filter((price) => compareDateKeys(price.date, startKey) >= 0 && compareDateKeys(price.date, endKey) <= 0)
    .sort((a, b) => compareDateKeys(a.date, b.date));

  if (deduped.length === 0) {
    throw new Error("Không lấy được dữ liệu giá BTC từ Binance.");
  }

  priceCache.set(cacheKey, deduped);
  return deduped;
}

export async function fetchCurrentPrice() {
  if (currentPriceCache) return currentPriceCache;
  const data = await fetchWithRetry(`${BINANCE_BASE_URL}/ticker/price?symbol=BTCUSDT`);
  const price = Number(data.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Giá BTC hiện tại không hợp lệ.");
  }
  currentPriceCache = price;
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

export function simulateDCA(prices, purchaseDates, amountPerPurchase, currentPrice) {
  const amount = Number(amountPerPurchase);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Số tiền mỗi lần mua phải lớn hơn 0.");
  }

  let totalInvested = 0;
  let totalBTC = 0;
  const snapshots = [];

  for (const date of purchaseDates) {
    const price = getPriceOnOrBefore(prices, date);
    if (!price) continue;

    const btcBought = amount / price.close;
    totalBTC += btcBought;
    totalInvested += amount;
    snapshots.push({
      date,
      totalInvested,
      portfolioValue: totalBTC * price.close
    });
  }

  if (totalBTC <= 0 || totalInvested <= 0) {
    throw new Error("Không có giao dịch hợp lệ trong khoảng thời gian đã chọn.");
  }

  const currentValue = totalBTC * currentPrice;
  const pnlUSD = currentValue - totalInvested;

  return {
    totalInvested,
    totalBTC,
    avgCost: totalInvested / totalBTC,
    currentValue,
    pnlUSD,
    pnlPercent: (pnlUSD / totalInvested) * 100,
    snapshots
  };
}

export function simulateLumpSum(prices, totalInvested, startDate, currentPrice) {
  const startPrice = getPriceOnOrBefore(prices, startDate) || prices[0];
  if (!startPrice) {
    throw new Error("Không có giá BTC tại ngày bắt đầu.");
  }

  const btc = totalInvested / startPrice.close;
  const value = btc * currentPrice;
  const pnlUSD = value - totalInvested;
  return {
    invested: totalInvested,
    btc,
    startPrice: startPrice.close,
    value,
    pnlUSD,
    pnlPercent: totalInvested > 0 ? (pnlUSD / totalInvested) * 100 : 0
  };
}

export function clearPriceCacheForTests() {
  priceCache.clear();
  currentPriceCache = null;
  exchangeRateCache = null;
}
