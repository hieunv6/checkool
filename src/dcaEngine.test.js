import test from "node:test";
import assert from "node:assert/strict";
import {
  generatePurchaseDates,
  getPriceOnOrBefore,
  simulateDCA,
  simulateLumpSum
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
