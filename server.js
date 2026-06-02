import express from "express";
import fs from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";

const MARKET_DATA_BASE_URL = "https://api.binance.com/api/v3";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const EARLIEST_BTC_DATE = "2017-08-17";
const DB_DIR = path.resolve("data");
const DB_PATH = path.join(DB_DIR, "checkool.sqlite");
const PORT = Number(process.env.API_PORT || 8787);
const CURRENT_PRICE_TTL_MS = 60 * 1000;

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
    CREATE TABLE IF NOT EXISTS btc_daily_prices (
      date TEXT PRIMARY KEY,
      close REAL NOT NULL,
      open_time INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS cache_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
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
  return compareDateKeys(dateKey, EARLIEST_BTC_DATE) < 0 ? EARLIEST_BTC_DATE : dateKey;
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
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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

async function fetchMarketCandles(startDate, endDate) {
  const candles = [];
  let cursor = parseDateKey(startDate).getTime();
  const endTime = parseDateKey(endDate).getTime() + ONE_DAY_MS - 1;

  while (cursor <= endTime) {
    const params = new URLSearchParams({
      symbol: "BTCUSDT",
      interval: "1d",
      startTime: String(cursor),
      endTime: String(endTime),
      limit: "1000"
    });
    const rows = await fetchWithRetry(`${MARKET_DATA_BASE_URL}/klines?${params.toString()}`);
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const row of rows) {
      candles.push({
        date: toDateKey(new Date(row[0])),
        close: Number(row[4]),
        openTime: Number(row[0])
      });
    }

    const nextCursor = Number(rows[rows.length - 1][0]) + ONE_DAY_MS;
    if (nextCursor <= cursor) break;
    cursor = nextCursor;
  }

  return candles;
}

async function saveCandles(candles) {
  if (candles.length === 0) return;
  const now = Date.now();
  await run("BEGIN TRANSACTION");
  try {
    for (const candle of candles) {
      await run(
        `
          INSERT INTO btc_daily_prices (date, close, open_time, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(date) DO UPDATE SET
            close = excluded.close,
            open_time = excluded.open_time,
            updated_at = excluded.updated_at
        `,
        [candle.date, candle.close, candle.openTime, now]
      );
    }
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
}

async function getCachedDailyPrices(startDate, endDate) {
  const startKey = clampStartDate(startDate);
  const endKey = endDate;
  const expectedDates = listDateKeys(startKey, endKey);
  const cached = await all(
    "SELECT date, close FROM btc_daily_prices WHERE date >= ? AND date <= ? ORDER BY date ASC",
    [startKey, endKey]
  );
  const cachedDates = new Set(cached.map((row) => row.date));
  const missingDates = expectedDates.filter((dateKey) => !cachedDates.has(dateKey));

  for (const [rangeStart, rangeEnd] of contiguousRanges(missingDates)) {
    const candles = await fetchMarketCandles(rangeStart, rangeEnd);
    await saveCandles(candles);
  }

  return all(
    "SELECT date, close FROM btc_daily_prices WHERE date >= ? AND date <= ? ORDER BY date ASC",
    [startKey, endKey]
  );
}

async function getCurrentPrice() {
  const cached = await get("SELECT value, updated_at FROM cache_meta WHERE key = ?", ["btc_current_price"]);
  if (cached && Date.now() - Number(cached.updated_at) < CURRENT_PRICE_TTL_MS) {
    return Number(cached.value);
  }

  const data = await fetchWithRetry(`${MARKET_DATA_BASE_URL}/ticker/price?symbol=BTCUSDT`);
  const price = Number(data.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid BTC price.");
  }
  await run(
    `
      INSERT INTO cache_meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `,
    ["btc_current_price", String(price), Date.now()]
  );
  return price;
}

await initDb();

const app = express();

app.get("/api/health", (request, response) => {
  response.json({ ok: true });
});

app.get("/api/btc/prices", async (request, response) => {
  try {
    const start = String(request.query.start || "").slice(0, 10);
    const end = String(request.query.end || "").slice(0, 10);
    if (!start || !end || compareDateKeys(start, end) > 0) {
      response.status(400).json({ error: "Invalid date range." });
      return;
    }
    const prices = await getCachedDailyPrices(start, end);
    response.json({ prices });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to load BTC prices." });
  }
});

app.get("/api/btc/current", async (request, response) => {
  try {
    response.json({ price: await getCurrentPrice() });
  } catch (error) {
    response.status(500).json({ error: error.message || "Failed to load current BTC price." });
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
