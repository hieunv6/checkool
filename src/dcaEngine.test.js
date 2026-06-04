import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateMaxDrawdown,
  calculateYearExtremes,
  calculateYearlyCagr,
  generatePurchaseDates,
  getPriceOnOrBefore,
  simulateDCA,
  simulateLumpSum,
  simulatePortfolioDCA,
  simulatePortfolioLumpSum
} from "./dcaEngine.js";

test("monthly frequency clamps to end of shorter months", () => {
  assert.deepEqual(generatePurchaseDates("2024-01-31", "2024-04-30", "monthly"), [
    "2024-01-31",
    "2024-02-29",
    "2024-03-31",
    "2024-04-30"
  ]);
});

test("weekly frequency advances from start date", () => {
  assert.deepEqual(generatePurchaseDates("2024-01-01", "2024-01-20", "weekly"), [
    "2024-01-01",
    "2024-01-08",
    "2024-01-15"
  ]);
});

test("missing candle uses the nearest previous close", () => {
  const prices = [
    { date: "2024-01-01", close: 100 },
    { date: "2024-01-03", close: 120 }
  ];
  assert.deepEqual(getPriceOnOrBefore(prices, "2024-01-02"), prices[0]);
});

test("DCA simulation calculates totals and snapshots", () => {
  const result = simulateDCA(
    [
      { date: "2024-01-01", close: 100 },
      { date: "2024-01-02", close: 200 }
    ],
    ["2024-01-01", "2024-01-02"],
    100,
    300
  );

  assert.equal(result.totalInvested, 200);
  assert.equal(result.totalBTC, 1.5);
  assert.equal(result.currentValue, 450);
  assert.equal(result.snapshots.length, 2);
  assert.deepEqual(result.snapshots[0], {
    date: "2024-01-01",
    price: 100,
    amount: 100,
    fee: 0,
    netAmount: 100,
    coinBought: 1,
    totalCoin: 1,
    totalInvested: 100,
    portfolioValue: 100
  });
});

test("DCA simulation applies buy and sell fees", () => {
  const result = simulateDCA(
    [{ date: "2024-01-01", close: 100 }],
    ["2024-01-01"],
    100,
    200,
    1
  );

  assert.equal(result.totalInvested, 100);
  assert.equal(result.totalBTC, 0.99);
  assert.equal(result.buyFees, 1);
  assert.equal(result.sellFee, 1.98);
  assert.equal(result.totalFees, 2.98);
  assert.equal(result.currentValue, 196.02);
});

test("lump sum simulation buys all at start price", () => {
  const result = simulateLumpSum(
    [
      { date: "2024-01-01", close: 100 },
      { date: "2024-01-02", close: 200 }
    ],
    200,
    "2024-01-01",
    300
  );

  assert.equal(result.btc, 2);
  assert.equal(result.value, 600);
  assert.equal(result.pnlPercent, 200);
});

test("lump sum simulation applies buy and sell fees", () => {
  const result = simulateLumpSum(
    [{ date: "2024-01-01", close: 100 }],
    100,
    "2024-01-01",
    200,
    1
  );

  assert.equal(result.btc, 0.99);
  assert.equal(result.buyFee, 1);
  assert.equal(result.sellFee, 1.98);
  assert.equal(result.value, 196.02);
});

test("portfolio DCA splits each purchase by allocation percent", () => {
  const result = simulatePortfolioDCA(
    [
      {
        coinId: "bitcoin",
        symbol: "BTC",
        name: "Bitcoin",
        allocationPercent: 60,
        currentPrice: 200,
        prices: [{ date: "2024-01-01", close: 100 }]
      },
      {
        coinId: "ethereum",
        symbol: "ETH",
        name: "Ethereum",
        allocationPercent: 40,
        currentPrice: 100,
        prices: [{ date: "2024-01-01", close: 50 }]
      }
    ],
    ["2024-01-01"],
    100,
    1
  );

  assert.equal(result.totalInvested, 100);
  assert.equal(result.orders.length, 2);
  assert.equal(result.orders[0].amount, 60);
  assert.equal(result.orders[1].amount, 40);
  assert.equal(result.assets[0].totalCoin, 0.594);
  assert.equal(result.assets[1].totalCoin, 0.792);
  assert.equal(result.currentValue, 196.02);
});

test("portfolio lump sum aggregates asset values", () => {
  const result = simulatePortfolioLumpSum(
    [
      {
        coinId: "bitcoin",
        symbol: "BTC",
        name: "Bitcoin",
        allocationPercent: 50,
        currentPrice: 200,
        prices: [{ date: "2024-01-01", close: 100 }]
      },
      {
        coinId: "ethereum",
        symbol: "ETH",
        name: "Ethereum",
        allocationPercent: 50,
        currentPrice: 100,
        prices: [{ date: "2024-01-01", close: 50 }]
      }
    ],
    100,
    "2024-01-01",
    0
  );

  assert.equal(result.invested, 100);
  assert.equal(result.value, 200);
  assert.equal(result.pnlPercent, 100);
});

test("portfolio DCA can rebalance back to target allocations", () => {
  const result = simulatePortfolioDCA(
    [
      {
        coinId: "bitcoin",
        symbol: "BTC",
        name: "Bitcoin",
        allocationPercent: 50,
        currentPrice: 400,
        prices: [
          { date: "2024-01-01", close: 100 },
          { date: "2024-02-01", close: 200 }
        ]
      },
      {
        coinId: "ethereum",
        symbol: "ETH",
        name: "Ethereum",
        allocationPercent: 50,
        currentPrice: 100,
        prices: [
          { date: "2024-01-01", close: 100 },
          { date: "2024-02-01", close: 100 }
        ]
      }
    ],
    ["2024-01-01", "2024-02-01"],
    100,
    0,
    { rebalanceFrequency: "monthly" }
  );

  assert.equal(result.rebalances.length, 2);
  assert.equal(result.rebalances[0].turnover, 0);
  assert.ok(result.rebalances[1].turnover > 0);
});

test("yearly CAGR uses the last snapshot of each year", () => {
  const result = calculateYearlyCagr([
    { date: "2024-01-01", totalInvested: 100, portfolioValue: 100 },
    { date: "2024-12-31", totalInvested: 200, portfolioValue: 300 },
    { date: "2025-12-31", totalInvested: 300, portfolioValue: 600 }
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].year, "2024");
  assert.equal(result[0].date, "2024-12-31");
  assert.equal(result[1].year, "2025");
  assert.equal(result[1].date, "2025-12-31");
  assert.ok(result[1].cagrPercent > 40);
  assert.equal(result[0].yoyReturnPercent, null);
  assert.equal(result[1].yoyReturnPercent, 100);
});

test("max drawdown finds largest peak to trough decline", () => {
  const result = calculateMaxDrawdown([
    { date: "2024-01-01", portfolioValue: 100 },
    { date: "2024-02-01", portfolioValue: 150 },
    { date: "2024-03-01", portfolioValue: 90 },
    { date: "2024-04-01", portfolioValue: 120 }
  ]);

  assert.equal(result.percent, 40);
  assert.equal(result.value, 60);
  assert.equal(result.peakDate, "2024-02-01");
  assert.equal(result.troughDate, "2024-03-01");
});

test("year extremes use YoY returns", () => {
  const result = calculateYearExtremes([
    { year: "2024", yoyReturnPercent: null },
    { year: "2025", yoyReturnPercent: 25 },
    { year: "2026", yoyReturnPercent: -10 }
  ]);

  assert.equal(result.best.year, "2025");
  assert.equal(result.worst.year, "2026");
});
