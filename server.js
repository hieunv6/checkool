import express from "express";
import fs from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";

const MARKET_DATA_BASE_URL = "https://api.coingecko.com/api/v3";
const EXCHANGE_DATA_BASE_URL = "https://api.binance.com/api/v3";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const EARLIEST_MARKET_DATE = "2017-08-17";
const DB_DIR = path.resolve("data");
const DB_PATH = path.join(DB_DIR, "checkool.sqlite");
const PORT = Number(process.env.API_PORT || 8787);
const CURRENT_PRICE_TTL_MS = 60 * 1000;
const TOP_COINS_TTL_MS = 6 * 60 * 60 * 1000;
const STABLE_SYMBOLS = new Set([
  "usdt",
  "usdc",
  "dai",
  "busd",
  "tusd",
  "usde",
  "fdusd",
  "usds",
  "usdp",
  "usdd",
  "gusd",
  "lusd",
  "frax",
  "susd",
  "pyusd",
  "usdj",
  "usdn",
  "eurc",
  "eurt",
  "usd1",
  "usyc",
  "usdg",
  "buidl",
  "usdy",
  "rlusd",
  "usdf"
]);

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS coin_daily_prices (
      coin_id TEXT NOT NULL,
      date TEXT NOT NULL,
      close REAL NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (coin_id, date)
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS cache_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS survey_feedback (
      id INTEGER PRIMARY KEY,
      feature TEXT NOT NULL,
      note TEXT,
      language TEXT NOT NULL,
      portfolio TEXT NOT NULL,
      frequency TEXT NOT NULL,
      rebalance_frequency TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  const oldBtcTable = await get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [
    "btc_daily_prices"
  ]);
  if (oldBtcTable) {
    await run(`
      INSERT OR IGNORE INTO coin_daily_prices (coin_id, date, close, updated_at)
      SELECT 'bitcoin', date, close, updated_at FROM btc_daily_prices
    `);
  }
}

function toDateKey(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * ONE_DAY_MS);
}

function compareDateKeys(a, b) {
  return String(a).slice(0, 10).localeCompare(String(b).slice(0, 10));
}

function clampStartDate(dateKey) {
  return compareDateKeys(dateKey, EARLIEST_MARKET_DATE) < 0 ? EARLIEST_MARKET_DATE : dateKey;
}

function listDateKeys(startDate, endDate) {
  const keys = [];
  let cursor = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

function contiguousRanges(dateKeys) {
  if (dateKeys.length === 0) return [];
  const ranges = [];
  let start = dateKeys[0];
  let prev = dateKeys[0];

  for (const dateKey of dateKeys.slice(1)) {
    const expectedNext = toDateKey(addDays(parseDateKey(prev), 1));
    if (dateKey === expectedNext) {
      prev = dateKey;
      continue;
    }
    ranges.push([start, prev]);
    start = dateKey;
    prev = dateKey;
  }

  ranges.push([start, prev]);
  return ranges;
}

async function fetchWithRetry(url, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status === 429 && attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function isStableCoin(coin) {
  const symbol = String(coin.symbol || "").toLowerCase();
  const name = String(coin.name || "").toLowerCase();
  return (
    STABLE_SYMBOLS.has(symbol) ||
    symbol.startsWith("usd") ||
    symbol.endsWith("usd") ||
    name.includes("stablecoin") ||
    name.includes("usd") ||
    name.includes("u.s. dollar") ||
    name.includes("us dollar") ||
    name.includes("global dollar")
  );
}

async function getTopCoins() {
  const cached = await get("SELECT value, updated_at FROM cache_meta WHERE key = ?", ["top_coins_v2"]);
  if (cached && Date.now() - Number(cached.updated_at) < TOP_COINS_TTL_MS) {
    return JSON.parse(cached.value);
  }

  const params = new URLSearchParams({
    vs_currency: "usd",
    order: "market_cap_desc",
    per_page: "250",
    page: "1",
    sparkline: "false",
    price_change_percentage: "24h"
  });
  let rows;
  try {
    rows = await fetchWithRetry(`${MARKET_DATA_BASE_URL}/coins/markets?${params.toString()}`);
  } catch (error) {
    const legacyCached = await get("SELECT value FROM cache_meta WHERE key IN (?, ?) ORDER BY updated_at DESC LIMIT 1", [
      "top_coins_v2",
      "top_coins"
    ]);
    if (legacyCached) {
      return JSON.parse(legacyCached.value).filter((coin) => !isStableCoin(coin)).slice(0, 50);
    }
    throw error;
  }
  const coins = rows
    .filter((coin) => !isStableCoin(coin))
    .slice(0, 50)
    .map((coin) => ({
      id: coin.id,
      symbol: String(coin.symbol || "").toUpperCase(),
      name: coin.name,
      image: coin.image,
      marketCapRank: coin.market_cap_rank,
      currentPrice: coin.current_price,
      marketCap: coin.market_cap
    }));

  await run(
    `
      INSERT INTO cache_meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `,
    ["top_coins_v2", JSON.stringify(coins), Date.now()]
  );
  return coins;
}

async function getCoinSymbol(coinId) {
  const topCoins = await getTopCoins();
  const coin = topCoins.find((item) => item.id === coinId);
  return coin?.symbol || (coinId === "bitcoin" ? "BTC" : coinId.toUpperCase());
}

async function fetchExchangeCandles(coinId, startDate, endDate) {
  const symbol = await getCoinSymbol(coinId);
  const pair = `${symbol}USDT`;
  const candles = [];
  let cursor = parseDateKey(startDate).getTime();
  const endTime = parseDateKey(endDate).getTime() + ONE_DAY_MS - 1;

  while (cursor <= endTime) {
    const params = new URLSearchParams({
      symbol: pair,
      interval: "1d",
      startTime: String(cursor),
      endTime: String(endTime),
      limit: "1000"
    });
    const rows = await fetchWithRetry(`${EXCHANGE_DATA_BASE_URL}/klines?${params.toString()}`);
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const row of rows) {
      candles.push({
        date: toDateKey(new Date(row[0])),
        close: Number(row[4])
      });
    }

    const nextCursor = Number(rows[rows.length - 1][0]) + ONE_DAY_MS;
    if (nextCursor <= cursor) break;
    cursor = nextCursor;
  }

  return candles;
}

async function fetchMarketPrices(coinId, startDate, endDate) {
  const from = Math.floor(parseDateKey(startDate).getTime() / 1000);
  const to = Math.floor((parseDateKey(endDate).getTime() + ONE_DAY_MS - 1) / 1000);
  const rangeParams = new URLSearchParams({
    vs_currency: "usd",
    from: String(from),
    to: String(to)
  });
  let data;
  try {
    data = await fetchWithRetry(
      `${MARKET_DATA_BASE_URL}/coins/${encodeURIComponent(coinId)}/market_chart/range?${rangeParams.toString()}`
    );
  } catch {
    const fallbackParams = new URLSearchParams({ vs_currency: "usd", days: "max" });
    try {
      data = await fetchWithRetry(
        `${MARKET_DATA_BASE_URL}/coins/${encodeURIComponent(coinId)}/market_chart?${fallbackParams.toString()}`
      );
    } catch {
      return fetchExchangeCandles(coinId, startDate, endDate);
    }
  }
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  const byDate = new Map();

  for (const [timestamp, close] of prices) {
    const date = toDateKey(new Date(timestamp));
    if (compareDateKeys(date, startDate) >= 0 && compareDateKeys(date, endDate) <= 0) {
      byDate.set(date, { date, close: Number(close) });
    }
  }

  return Array.from(byDate.values()).filter((price) => Number.isFinite(price.close) && price.close > 0);
}

async function saveCoinPrices(coinId, prices) {
  if (prices.length === 0) return;
  const now = Date.now();
  await run("BEGIN TRANSACTION");
  try {
    for (const price of prices) {
      await run(
        `
          INSERT INTO coin_daily_prices (coin_id, date, close, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(coin_id, date) DO UPDATE SET
            close = excluded.close,
            updated_at = excluded.updated_at
        `,
        [coinId, price.date, price.close, now]
      );
    }
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
}

async function getCachedDailyPrices(coinId, startDate, endDate) {
  const startKey = clampStartDate(startDate);
  const endKey = endDate;
  const expectedDates = listDateKeys(startKey, endKey);
  const cached = await all(
    "SELECT date, close FROM coin_daily_prices WHERE coin_id = ? AND date >= ? AND date <= ? ORDER BY date ASC",
    [coinId, startKey, endKey]
  );
  const cachedDates = new Set(cached.map((row) => row.date));
  const missingDates = expectedDates.filter((dateKey) => !cachedDates.has(dateKey));

  for (const [rangeStart, rangeEnd] of contiguousRanges(missingDates)) {
    const prices = await fetchMarketPrices(coinId, rangeStart, rangeEnd);
    await saveCoinPrices(coinId, prices);
  }

  return all(
    "SELECT date, close FROM coin_daily_prices WHERE coin_id = ? AND date >= ? AND date <= ? ORDER BY date ASC",
    [coinId, startKey, endKey]
  );
}

async function getCurrentPrice(coinId) {
  const key = `current_price:${coinId}`;
  const cached = await get("SELECT value, updated_at FROM cache_meta WHERE key = ?", [key]);
  if (cached && Date.now() - Number(cached.updated_at) < CURRENT_PRICE_TTL_MS) {
    return Number(cached.value);
  }

  const params = new URLSearchParams({ ids: coinId, vs_currencies: "usd" });
  let price;
  try {
    const data = await fetchWithRetry(`${MARKET_DATA_BASE_URL}/simple/price?${params.toString()}`);
    price = Number(data?.[coinId]?.usd);
  } catch {
    const symbol = await getCoinSymbol(coinId);
    const data = await fetchWithRetry(`${EXCHANGE_DATA_BASE_URL}/ticker/price?symbol=${symbol}USDT`);
    price = Number(data?.price);
  }
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid current price.");
  }
  await run(
    `
      INSERT INTO cache_meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `,
    [key, String(price), Date.now()]
  );
  return price;
}

await initDb();

const app = express();
app.use(express.json());

app.post("/api/survey/feedback", async (request, response) => {
  try {
    const { feature, note, language, portfolio, frequency, rebalanceFrequency } = request.body;
    if (!feature || !language || !portfolio || !frequency || !rebalanceFrequency) {
      response.status(400).json({ error: "Missing required fields." });
      return;
    }
    await run(
      `
        INSERT INTO survey_feedback (feature, note, language, portfolio, frequency, rebalance_frequency, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [feature, note || "", language, portfolio, frequency, rebalanceFrequency, Date.now()]
    );
    response.json({ ok: true });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to save feedback." });
  }
});

app.get("/api/survey/feedback", async (request, response) => {
  try {
    const feedback = await all("SELECT * FROM survey_feedback ORDER BY created_at DESC");
    response.json({ feedback });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to load feedback." });
  }
});

app.delete("/api/survey/feedback/:id", async (request, response) => {
  try {
    const id = Number(request.params.id);
    await run("DELETE FROM survey_feedback WHERE id = ?", [id]);
    response.json({ ok: true });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to delete feedback." });
  }
});

app.get("/feedback-check", (request, response) => {
  response.sendFile(path.resolve("dist/feedback-check.html"));
});

app.get("/api/health", (request, response) => {
  response.json({ ok: true });
});

app.get("/api/coins/top", async (request, response) => {
  try {
    response.json({ coins: await getTopCoins() });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to load top coins." });
  }
});

app.get("/api/coins/:coinId/prices", async (request, response) => {
  try {
    const coinId = String(request.params.coinId || "").trim();
    const start = String(request.query.start || "").slice(0, 10);
    const end = String(request.query.end || "").slice(0, 10);
    if (!coinId || !start || !end || compareDateKeys(start, end) > 0) {
      response.status(400).json({ error: "Invalid request." });
      return;
    }
    const prices = await getCachedDailyPrices(coinId, start, end);
    response.json({ prices });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to load market prices." });
  }
});

app.get("/api/coins/:coinId/current", async (request, response) => {
  try {
    const coinId = String(request.params.coinId || "").trim();
    if (!coinId) {
      response.status(400).json({ error: "Invalid coin id." });
      return;
    }
    response.json({ price: await getCurrentPrice(coinId) });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to load current price." });
  }
});

app.get("/api/btc/prices", async (request, response) => {
  try {
    const start = String(request.query.start || "").slice(0, 10);
    const end = String(request.query.end || "").slice(0, 10);
    if (!start || !end || compareDateKeys(start, end) > 0) {
      response.status(400).json({ error: "Invalid request." });
      return;
    }
    const prices = await getCachedDailyPrices("bitcoin", start, end);
    response.json({ prices });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to load market prices." });
  }
});

app.get("/api/btc/current", async (request, response) => {
  try {
    response.json({ price: await getCurrentPrice("bitcoin") });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to load current price." });
  }
});

app.use(express.static(path.resolve("dist")));

app.get(/.*/, (request, response) => {
  response.sendFile(path.resolve("dist", "index.html"));
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`API server running at http://127.0.0.1:${PORT}`);
  console.log(`SQLite cache: ${DB_PATH}`);
});
