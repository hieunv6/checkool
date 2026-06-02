# DCA BTC Calculator

Web tool tinh toan va backtest chien luoc Dollar-Cost Averaging (DCA) cho Bitcoin bang du lieu lich su BTC/USDT tu Binance.

## Tinh nang

- Tinh DCA theo tan suat daily, weekly, biweekly, monthly.
- Mo phong tu ngay bat dau den ngay ket thuc tuy chon.
- Hien thi tong dau tu, tong BTC, gia von trung binh, gia tri hien tai, lai/lo va phan tram lai/lo.
- So sanh DCA voi Lump Sum.
- Bieu do gia tri danh muc va tong tien da dau tu bang Recharts.
- Toggle hien thi USD hoac VND.
- Chia se ket qua bang query params tren URL.
- Xu ly edge cases: ngay tuong lai, amount <= 0, du lieu Binance truoc 2017-08-17, pagination > 1000 ngay, retry khi API bi rate limit.

## Tech stack

- React 18
- Vite
- Tailwind CSS
- Recharts
- Binance Public REST API
- exchangerate.host, co fallback `25400` VND/USD

## Cai dat

```bash
npm install
```

## Chay local

```bash
npm run dev
```

Mac dinh Vite se mo tai:

```text
http://127.0.0.1:5173/
```

Neu can bind ro host:

```bash
npm run dev -- --host 127.0.0.1
```

## Test

```bash
npm test
```

Test hien tai tap trung vao engine tinh toan:

- Sinh ngay mua theo weekly/monthly.
- Monthly clamp ve ngay cuoi thang khi thang ngan hon.
- Lay gia gan nhat truoc do khi thieu candle.
- Tinh DCA.
- Tinh Lump Sum.

## Build production

```bash
npm run build
```

Output nam trong thu muc `dist/`, phu hop deploy len Cloudflare Pages, Netlify hoac static host tuong duong.

## URL state

App doc state tu query params va tu dong tinh neu du thong tin:

```text
?amount=100&freq=weekly&start=2021-01-01&end=2026-06-01&cur=USD
```

Trong do:

- `amount`: so tien moi lan mua, tinh bang USD.
- `freq`: `daily`, `weekly`, `biweekly`, hoac `monthly`.
- `start`: ngay bat dau, format `YYYY-MM-DD`.
- `end`: ngay ket thuc, format `YYYY-MM-DD`.
- `cur`: `USD` hoac `VND`, chi anh huong hien thi.

## Cau truc chinh

```text
src/
  App.jsx             UI, form state, chart, URL sharing
  dcaEngine.js        Pure logic + data fetching Binance/exchange rate
  dcaEngine.test.js   Node test cho core calculation
  main.jsx            React entrypoint
  styles.css          Tailwind entry + base styles
```

## Luu y

- App khong co backend, database, dang nhap, `localStorage` hay `sessionStorage`.
- Toan bo tinh toan chay client-side.
- Du lieu gia BTC dung close price daily cua Binance BTCUSDT.
- Cong cu chi mang tinh minh hoa dua tren du lieu lich su, khong phai loi khuyen dau tu.
