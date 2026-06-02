# DCA BTC Calculator

A client-side web tool for calculating and backtesting a Bitcoin Dollar-Cost Averaging (DCA) strategy using historical BTC market data.

## Features

- Simulate BTC DCA with daily, weekly, biweekly, or monthly purchase schedules.
- Choose a custom start date and end date.
- View total invested, accumulated BTC, average cost, current value, profit/loss, and profit/loss percentage.
- Include a per-trade buy/sell fee percentage in the simulation.
- Compare DCA against a Lump Sum strategy.
- Visualize portfolio value versus total invested with Recharts.
- Toggle displayed monetary values between USD and VND.
- Switch the UI language between Vietnamese, English, Spanish, Chinese, Japanese, and Korean.
- Share results through URL query parameters.
- Handles required edge cases: future dates, invalid purchase amount, market data before `2017-08-17`, pagination for ranges over 1,000 days, and API retry on rate limit.

## Tech Stack

- React 18
- Vite
- Tailwind CSS
- Recharts
- Public market data API
- Express API server
- SQLite cache
- exchangerate.host with a `25400` VND/USD fallback rate

## Installation

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

This starts both the API server and Vite. Vite normally serves the app at:

```text
http://127.0.0.1:5173/
```

The API server runs at:

```text
http://127.0.0.1:8787/
```

BTC daily prices are cached in:

```text
data/checkool.sqlite
```

To run each process separately:

```bash
npm run dev:api
npm run dev:web
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

To serve the built app with the SQLite-backed API:

```bash
npm run serve
```

## URL State

The app reads state from query parameters and auto-runs the calculation on first load:

```text
?amount=100&fee=0.1&freq=weekly&start=2021-01-01&end=2026-06-01&cur=USD
```

Parameters:

- `amount`: purchase amount per interval, in USD.
- `fee`: buy/sell fee per trade, as a percentage.
- `freq`: `daily`, `weekly`, `biweekly`, or `monthly`.
- `start`: start date in `YYYY-MM-DD` format.
- `end`: end date in `YYYY-MM-DD` format.
- `cur`: `USD` or `VND`; affects display only.
- `lang`: `vi`, `en`, `es`, `zh`, `ja`, or `ko`.

## Project Structure

```text
src/
  App.jsx             UI, form state, chart, and URL sharing
  dcaEngine.js        Pure calculation logic and market/exchange-rate fetching
  dcaEngine.test.js   Node tests for core calculations
  main.jsx            React entry point
  styles.css          Tailwind entry and base styles
server.js             Express API server and SQLite cache
vite.config.js        Vite React config and API proxy
```

## Notes

- The app has no authentication, `localStorage`, or `sessionStorage`.
- DCA calculations run client-side.
- BTC daily market prices are cached in SQLite after the first API request for a date range.
- Current BTC price is cached briefly to avoid repeated calls during quick recalculations.
- This tool is for historical illustration only and is not investment advice.
