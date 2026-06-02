# MVP Spec — DCA BTC Calculator

> **Mục đích tài liệu:** Đây là spec đầy đủ để bất kỳ AI coding assistant nào (Claude, GPT, Cursor, Copilot...) có thể implement MVP mà không cần hỏi lại. Mọi quyết định kỹ thuật, công thức, và tiêu chí nghiệm thu đều đã được định nghĩa rõ. Khi đưa cho AI, dán toàn bộ file này kèm câu lệnh: *"Implement đầy đủ MVP theo spec dưới đây. Code production-ready, có comment, xử lý đủ edge case."*

---

## 1. Tổng quan

Web tool tính toán và backtest chiến lược **Dollar-Cost Averaging (DCA)** cho Bitcoin, dùng dữ liệu giá lịch sử thật. Người dùng nhập số tiền + tần suất + khoảng thời gian, tool mô phỏng kết quả như thể họ đã DCA trong quá khứ, và so sánh với các lựa chọn khác (lump sum, vàng, giữ tiền mặt).

**Đối tượng:** Nhà đầu tư crypto retail toàn cầu + thị trường Việt Nam.

**Triết lý MVP:** Một trang duy nhất, không backend, không đăng nhập, không database. Toàn bộ tính toán chạy client-side. Deploy lên static host (Cloudflare Pages / Netlify) chi phí $0.

---

## 2. Phạm vi (Scope)

### TRONG phạm vi MVP
- Tính DCA cho **BTC/USDT** với tần suất: hàng ngày / tuần / 2 tuần / tháng.
- Khoảng thời gian tùy chọn: từ ngày bắt đầu đến hiện tại (hoặc ngày kết thúc tùy chọn).
- Hiển thị: tổng đầu tư, tổng BTC tích lũy, giá vốn trung bình, giá trị hiện tại, lãi/lỗ (USD + %).
- So sánh DCA vs **Lump Sum** (đầu tư 1 lần toàn bộ vào ngày bắt đầu).
- Biểu đồ đường: giá trị danh mục theo thời gian vs tổng tiền đã bỏ vào.
- Toggle hiển thị giá trị theo **USD** hoặc **VND**.
- Chia sẻ kết quả qua URL (state nằm trong query params).
- Responsive mobile-first.

### NGOÀI phạm vi MVP (để phase sau)
- Đăng nhập / lưu portfolio.
- Altcoin (ETH, SOL...).
- Phí giao dịch theo từng sàn.
- So sánh với vàng / S&P500 (ghi chú: để phase 2, vì cần thêm nguồn data).
- Alert giá, auto-DCA, kết nối API sàn.

---

## 3. Tech Stack (bắt buộc)

| Lớp | Công nghệ | Lý do |
|---|---|---|
| Framework | **React 18** (Vite) hoặc HTML/JS thuần nếu AI render artifact | Nhẹ, deploy static dễ |
| Styling | **Tailwind CSS** | Nhanh, nhất quán |
| Chart | **Recharts** | API đơn giản, đủ cho line chart |
| Data giá | **Binance Public REST API** | Miễn phí, không cần key, không giới hạn pháp lý |
| Tỷ giá USD/VND | **exchangerate.host** (free) hoặc hardcode fallback | Quy đổi VND |
| State | React `useState` / URL query params | Không cần thư viện state |
| Host | Cloudflare Pages / Netlify | Free tier, không ràng buộc thương mại |

> **Ràng buộc quan trọng:** KHÔNG dùng `localStorage`/`sessionStorage` nếu render trong artifact. Toàn bộ state giữ trong memory hoặc URL.

---

## 4. Nguồn dữ liệu — Binance API (chi tiết)

### 4.1 Giá lịch sử (klines)
```
GET https://api.binance.com/api/v3/klines
  ?symbol=BTCUSDT
  &interval=1d
  &startTime={unix_ms}
  &endTime={unix_ms}
  &limit=1000
```
- `interval=1d` cho mọi tần suất (lấy giá daily, rồi lọc theo ngày mua).
- Mỗi kline trả về array: `[openTime, open, high, low, close, volume, closeTime, ...]`.
- **Dùng giá `close`** (index 4) làm giá mua cho mỗi ngày.
- Binance giới hạn `limit=1000` candles/request → nếu khoảng thời gian > 1000 ngày, **phải gọi nhiều lần** và nối kết quả (pagination bằng cách dời `startTime`).

### 4.2 Giá hiện tại
```
GET https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
```
Trả về `{ "symbol": "BTCUSDT", "price": "70123.45" }`.

### 4.3 Tỷ giá USD/VND
```
GET https://api.exchangerate.host/latest?base=USD&symbols=VND
```
Nếu lỗi → fallback hardcode `USD_VND = 25400` (cập nhật con số gần đúng khi build).

### 4.4 Xử lý lỗi & rate limit
- Wrap mọi fetch trong try/catch.
- Nếu Binance trả 429 (rate limit) → đợi 1s rồi retry tối đa 3 lần.
- Hiển thị loading state khi đang fetch; hiển thị thông báo lỗi thân thiện nếu fail.
- Cache kết quả klines trong memory để không gọi lại khi user chỉ đổi số tiền (giá lịch sử không đổi).

---

## 5. Logic tính toán (CỐT LÕI — phải đúng tuyệt đối)

### 5.1 Sinh danh sách ngày mua
Cho `startDate`, `endDate`, `frequency`:
- `daily`: mỗi ngày một lần mua.
- `weekly`: mỗi 7 ngày kể từ startDate.
- `biweekly`: mỗi 14 ngày.
- `monthly`: cùng ngày trong tháng (vd ngày 1 mỗi tháng); nếu tháng không có ngày đó thì dùng ngày cuối tháng.

### 5.2 Mô phỏng DCA
```
totalInvested = 0
totalBTC = 0
for mỗi purchaseDate trong danh sách:
    priceThatDay = close price của BTCUSDT ngày đó (lấy gần nhất nếu thiếu)
    btcBought = amountPerPurchase / priceThatDay
    totalBTC += btcBought
    totalInvested += amountPerPurchase
    # lưu snapshot {date, totalInvested, portfolioValue = totalBTC * priceThatDay} cho chart

avgCost = totalInvested / totalBTC
currentValue = totalBTC * currentPrice
pnlUSD = currentValue - totalInvested
pnlPercent = (pnlUSD / totalInvested) * 100
```

### 5.3 Mô phỏng Lump Sum (để so sánh)
```
btcLumpSum = totalInvested / priceAtStartDate   # mua hết 1 lần vào ngày đầu
lumpSumValue = btcLumpSum * currentPrice
lumpSumPnlPercent = ((lumpSumValue - totalInvested) / totalInvested) * 100
```

### 5.4 Quy đổi VND
Mọi giá trị USD nhân với `USD_VND` khi toggle bật VND. BTC giữ nguyên đơn vị BTC.

### 5.5 Edge cases bắt buộc xử lý
- startDate trong tương lai → báo lỗi.
- startDate trước khi BTC có dữ liệu trên Binance (BTCUSDT bắt đầu ~2017-08) → clamp về ngày sớm nhất có data + cảnh báo.
- amountPerPurchase ≤ 0 → disable nút tính.
- Ngày mua rơi vào ngày thiếu candle → dùng giá close của ngày gần nhất trước đó.
- Khoảng thời gian quá ngắn (chỉ 1 lần mua) → vẫn tính được, không crash.

---

## 6. Giao diện (UI/UX)

### 6.1 Layout (mobile-first, 1 trang)
```
┌─────────────────────────────────┐
│  Header: tên tool + toggle USD/VND │
├─────────────────────────────────┤
│  PANEL INPUT (form)               │
│   - Số tiền mỗi lần               │
│   - Tần suất (dropdown)           │
│   - Ngày bắt đầu (date picker)    │
│   - Ngày kết thúc (mặc định: nay) │
│   - Nút "Tính toán"               │
├─────────────────────────────────┤
│  PANEL KẾT QUẢ (cards)            │
│   [Tổng đầu tư] [Tổng BTC]        │
│   [Giá vốn TB]  [Giá trị hiện tại]│
│   [Lãi/Lỗ USD]  [Lãi/Lỗ %]        │
├─────────────────────────────────┤
│  BIỂU ĐỒ (Recharts line)          │
│   - Đường 1: Giá trị danh mục     │
│   - Đường 2: Tổng tiền đã bỏ vào  │
├─────────────────────────────────┤
│  SO SÁNH DCA vs LUMP SUM (table)  │
├─────────────────────────────────┤
│  Nút "Copy link kết quả"          │
│  Disclaimer (không phải lời khuyên)│
└─────────────────────────────────┘
```

### 6.2 Quy tắc thiết kế
- Số liệu lãi: **xanh** nếu dương, **đỏ** nếu âm.
- Loading skeleton khi fetch data.
- Tooltip trên chart hiển thị ngày + cả 2 giá trị.
- Format số: dấu phân cách hàng nghìn, BTC làm tròn 6 chữ số, USD 2 chữ số.
- Disclaimer rõ ràng ở cuối: *"Công cụ chỉ mang tính minh họa dựa trên dữ liệu lịch sử, không phải lời khuyên đầu tư."*

### 6.3 URL state (chia sẻ)
Encode input vào query params:
```
?amount=100&freq=weekly&start=2021-01-01&end=2026-06-01&cur=USD
```
Khi load trang, đọc params này và tự động tính nếu có đủ.

---

## 7. Cấu trúc component (gợi ý)

```
App
├── Header (logo + currency toggle)
├── InputPanel
│   ├── AmountInput
│   ├── FrequencySelect
│   ├── DateRangePicker
│   └── CalculateButton
├── ResultsPanel
│   └── StatCard (x6, reusable)
├── PortfolioChart (Recharts)
├── ComparisonTable (DCA vs Lump Sum)
├── ShareButton
└── Disclaimer
```

Tách logic tính toán ra module riêng `dcaEngine.js` (pure functions, không phụ thuộc UI) để dễ test:
- `generatePurchaseDates(start, end, freq)`
- `fetchHistoricalPrices(start, end)` → gọi Binance, xử lý pagination
- `simulateDCA(prices, dates, amount)`
- `simulateLumpSum(prices, totalInvested, start)`

---

## 8. Tiêu chí nghiệm thu (Acceptance Criteria)

Tool được coi là HOÀN THÀNH MVP khi:

1. ☐ Nhập $100/tuần từ 2021-01-01 đến nay → ra kết quả khớp với dcabtc.com (sai số < 2% do nguồn giá khác nhau).
2. ☐ Đổi tần suất sang monthly → kết quả cập nhật, không gọi lại Binance (dùng cache).
3. ☐ Toggle USD ↔ VND → mọi số tiền quy đổi đúng, BTC giữ nguyên.
4. ☐ Biểu đồ hiển thị 2 đường rõ ràng, có tooltip.
5. ☐ Bảng so sánh DCA vs Lump Sum hiển thị đúng cả 2 cột.
6. ☐ Copy link → mở link mới ra đúng kết quả đó.
7. ☐ Nhập ngày tương lai / số tiền 0 → báo lỗi, không crash.
8. ☐ Chạy mượt trên mobile (375px width).
9. ☐ Khoảng thời gian > 1000 ngày → pagination hoạt động, lấy đủ data.
10. ☐ Binance API lỗi → hiển thị thông báo, không màn hình trắng.

---

## 9. Các bước build (milestones cho AI)

1. **Setup:** Vite + React + Tailwind + Recharts. Layout khung tĩnh.
2. **Data layer:** Viết `dcaEngine.js` — fetch Binance klines có pagination + lấy giá hiện tại. Test bằng console.
3. **Core calc:** `simulateDCA` + `simulateLumpSum`. Verify số liệu thủ công với 1 ví dụ.
4. **UI wiring:** Nối form → engine → result cards.
5. **Chart:** Vẽ portfolio value vs invested.
6. **Comparison table + VND toggle.**
7. **URL state + share button.**
8. **Edge cases + error handling + loading states.**
9. **Polish:** responsive, format số, disclaimer.
10. **Test theo checklist mục 8.**

---

## 10. Hướng mở rộng sau MVP (ghi chú, KHÔNG làm trong phase này)

- Thêm so sánh với vàng (data: gold price API) và S&P500.
- Thêm altcoin (đổi `symbol` động: ETHUSDT, SOLUSDT...).
- Tính phí giao dịch theo sàn (Binance 0.1%, Coinbase 1.49%...).
- Module thứ 2 của hệ sinh thái: Compound Interest Calculator, Position Size Calculator.
- SEO: mỗi tần suất/coin là 1 landing page riêng để bắt long-tail keyword.

---

*Hết spec. Tài liệu này tự đủ để implement không cần thông tin ngoài.*
