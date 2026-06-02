# DCA BTC Calculator

A client-side web tool for calculating and backtesting a Bitcoin Dollar-Cost Averaging (DCA) strategy using historical BTC/USDT data from Binance.

## Features

- Simulate BTC DCA with daily, weekly, biweekly, or monthly purchase schedules.
- Choose a custom start date and end date.
- View total invested, accumulated BTC, average cost, current value, profit/loss, and profit/loss percentage.
- Compare DCA against a Lump Sum strategy.
- Visualize portfolio value versus total invested with Recharts.
- Toggle displayed monetary values between USD and VND.
- Share results through URL query parameters.
- Handles required edge cases: future dates, invalid purchase amount, Binance data before `2017-08-17`, pagination for ranges over 1,000 days, and API retry on rate limit.

## Tech Stack

- React 18
- Vite
- Tailwind CSS
- Recharts
- Binance Public REST API
- exchangerate.host with a `25400` VND/USD fallback rate

## Installation

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Vite normally serves the app at:

```text
http://127.0.0.1:5173/
```

To bind the host explicitly:

```bash
npm run dev -- --host 127.0.0.1
```

## Test

```bash
npm test
```

Current tests focus on the calculation engine:

- Generating weekly and monthly purchase dates.
- Clamping monthly purchases to the last day of shorter months.
- Using the nearest previous close when a candle is missing.
- Simulating DCA.
- Simulating Lump Sum.

## Production Build

```bash
npm run build
```

The production output is generated in `dist/` and can be deployed to Cloudflare Pages, Netlify, or any equivalent static hosting provider.

## URL State

The app reads state from query parameters and auto-runs the calculation when enough inputs are present:

```text
?amount=100&freq=weekly&start=2021-01-01&end=2026-06-01&cur=USD
```

Parameters:

- `amount`: purchase amount per interval, in USD.
- `freq`: `daily`, `weekly`, `biweekly`, or `monthly`.
- `start`: start date in `YYYY-MM-DD` format.
- `end`: end date in `YYYY-MM-DD` format.
- `cur`: `USD` or `VND`; affects display only.

## Project Structure

```text
src/
  App.jsx             UI, form state, chart, and URL sharing
  dcaEngine.js        Pure calculation logic and Binance/exchange-rate fetching
  dcaEngine.test.js   Node tests for core calculations
  main.jsx            React entry point
  styles.css          Tailwind entry and base styles
```

## Notes

- The app has no backend, database, authentication, `localStorage`, or `sessionStorage`.
- All calculations run client-side.
- BTC prices use the daily close price from Binance BTCUSDT candles.
- This tool is for historical illustration only and is not investment advice.
