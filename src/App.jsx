import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  EARLIEST_BTCUSDT_DATE,
  clampStartDate,
  compareDateKeys,
  fetchCurrentPrice,
  fetchHistoricalPrices,
  fetchUsdVndRate,
  generatePurchaseDates,
  simulateDCA,
  simulateLumpSum,
  todayKey
} from "./dcaEngine.js";

const FREQUENCIES = [
  { value: "daily", label: "Hàng ngày" },
  { value: "weekly", label: "Hàng tuần" },
  { value: "biweekly", label: "Mỗi 2 tuần" },
  { value: "monthly", label: "Hàng tháng" }
];

const DEFAULT_FORM = {
  amount: "100",
  frequency: "weekly",
  startDate: "2021-01-01",
  endDate: todayKey()
};

function readInitialState() {
  const params = new URLSearchParams(window.location.search);
  return {
    form: {
      amount: params.get("amount") || DEFAULT_FORM.amount,
      frequency: params.get("freq") || DEFAULT_FORM.frequency,
      startDate: params.get("start") || DEFAULT_FORM.startDate,
      endDate: params.get("end") || DEFAULT_FORM.endDate
    },
    currency: params.get("cur") === "VND" ? "VND" : "USD",
    shouldAutoRun: Boolean(params.get("amount") && params.get("freq") && params.get("start"))
  };
}

const initialState = readInitialState();

function buildShareUrl(form, currency) {
  const params = new URLSearchParams({
    amount: form.amount,
    freq: form.frequency,
    start: form.startDate,
    end: form.endDate,
    cur: currency
  });
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

function formatMoney(value, currency, rate) {
  const converted = currency === "VND" ? value * rate : value;
  return new Intl.NumberFormat(currency === "VND" ? "vi-VN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "VND" ? 0 : 2
  }).format(converted);
}

function formatBTC(value) {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  }).format(value)} BTC`;
}

function formatPercent(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function validateForm(form) {
  const amount = Number(form.amount);
  const now = todayKey();
  if (!Number.isFinite(amount) || amount <= 0) return "Số tiền mỗi lần mua phải lớn hơn 0.";
  if (!form.startDate || !form.endDate) return "Vui lòng chọn ngày bắt đầu và ngày kết thúc.";
  if (compareDateKeys(form.startDate, now) > 0) return "Ngày bắt đầu không được nằm trong tương lai.";
  if (compareDateKeys(form.endDate, now) > 0) return "Ngày kết thúc không được nằm trong tương lai.";
  if (compareDateKeys(form.startDate, form.endDate) > 0) return "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.";
  return "";
}

function Field({ label, children }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-ink">
      <span>{label}</span>
      {children}
    </label>
  );
}

function StatCard({ label, value, tone = "default" }) {
  const toneClass = tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-ink";
  return (
    <div className="rounded-lg border border-line bg-panel p-4 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-2 break-words text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="rounded-lg border border-line bg-panel p-4">
          <div className="skeleton h-4 w-28 rounded" />
          <div className="skeleton mt-4 h-7 w-40 rounded" />
        </div>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label, currency, rate }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white p-3 text-sm shadow-lg">
      <p className="font-semibold text-ink">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} style={{ color: item.color }}>
          {item.name}: {formatMoney(item.value, currency, rate)}
        </p>
      ))}
    </div>
  );
}

export default function App() {
  const [form, setForm] = useState(initialState.form);
  const [currency, setCurrency] = useState(initialState.currency);
  const [usdVndRate, setUsdVndRate] = useState(25400);
  const [result, setResult] = useState(null);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasAutoRunRef = useRef(false);

  const formError = validateForm(form);
  const isInvalid = Boolean(formError);

  const runCalculation = useCallback(async () => {
    const validation = validateForm(form);
    if (validation) {
      setError(validation);
      setResult(null);
      return;
    }

    setIsLoading(true);
    setError("");
    setWarning("");
    setCopied(false);

    try {
      const clampedStart = clampStartDate(form.startDate);
      const localWarning =
        clampedStart !== form.startDate
          ? `BTCUSDT trên Binance bắt đầu từ ${EARLIEST_BTCUSDT_DATE}; đã dùng ngày này thay cho ngày bắt đầu.`
          : "";
      const purchaseDates = generatePurchaseDates(clampedStart, form.endDate, form.frequency);

      const [prices, currentPrice, rate] = await Promise.all([
        fetchHistoricalPrices(clampedStart, form.endDate),
        fetchCurrentPrice(),
        fetchUsdVndRate()
      ]);

      const dca = simulateDCA(prices, purchaseDates, Number(form.amount), currentPrice);
      const lumpSum = simulateLumpSum(prices, dca.totalInvested, clampedStart, currentPrice);

      setUsdVndRate(rate);
      setWarning(localWarning);
      if (clampedStart !== form.startDate) {
        setForm((current) => ({ ...current, startDate: clampedStart }));
      }

      setResult({
        dca,
        lumpSum,
        currentPrice,
        purchaseCount: purchaseDates.length,
        effectiveStart: clampedStart
      });

      window.history.replaceState(null, "", buildShareUrl({ ...form, startDate: clampedStart }, currency));
    } catch (calculationError) {
      setResult(null);
      setError(
        calculationError?.message ||
          "Không thể tính toán lúc này. Vui lòng thử lại sau hoặc rút ngắn khoảng thời gian."
      );
    } finally {
      setIsLoading(false);
    }
  }, [currency, form]);

  useEffect(() => {
    if (initialState.shouldAutoRun && !hasAutoRunRef.current) {
      hasAutoRunRef.current = true;
      runCalculation();
    }
  }, [runCalculation]);

  useEffect(() => {
    if (result) {
      window.history.replaceState(null, "", buildShareUrl(form, currency));
    }
  }, [currency, form, result]);

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.dca.snapshots.map((point) => ({
      date: point.date,
      invested: point.totalInvested,
      portfolioValue: point.portfolioValue
    }));
  }, [result]);

  const money = useCallback((value) => formatMoney(value, currency, usdVndRate), [currency, usdVndRate]);
  const pnlTone = result?.dca.pnlUSD >= 0 ? "gain" : "loss";
  const shareUrl = buildShareUrl(form, currency);

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("Không copy được link tự động. Vui lòng copy URL trên thanh địa chỉ.");
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <main className="min-h-screen bg-[#F5F7F8]">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h1 className="text-2xl font-bold tracking-normal text-ink">DCA BTC Calculator</h1>
            <p className="mt-1 text-sm text-muted">Backtest chiến lược mua BTC định kỳ bằng dữ liệu Binance.</p>
          </div>
          <div className="inline-flex w-fit rounded-lg border border-line bg-[#F8FAFC] p-1">
            {["USD", "VND"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCurrency(item)}
                className={`h-10 min-w-16 rounded-md px-4 text-sm font-semibold transition ${
                  currency === item ? "bg-brand text-white shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[360px_1fr]">
        <section className="h-fit rounded-lg border border-line bg-panel p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Thông tin đầu tư</h2>
          <div className="mt-5 grid gap-4">
            <Field label="Số tiền mỗi lần mua (USD)">
              <input
                type="number"
                min="0"
                step="1"
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                className="h-11 rounded-lg border border-line bg-white px-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </Field>
            <Field label="Tần suất">
              <select
                value={form.frequency}
                onChange={(event) => updateForm("frequency", event.target.value)}
                className="h-11 rounded-lg border border-line bg-white px-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              >
                {FREQUENCIES.map((frequency) => (
                  <option key={frequency.value} value={frequency.value}>
                    {frequency.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ngày bắt đầu">
              <input
                type="date"
                value={form.startDate}
                max={todayKey()}
                onChange={(event) => updateForm("startDate", event.target.value)}
                className="h-11 rounded-lg border border-line bg-white px-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </Field>
            <Field label="Ngày kết thúc">
              <input
                type="date"
                value={form.endDate}
                max={todayKey()}
                onChange={(event) => updateForm("endDate", event.target.value)}
                className="h-11 rounded-lg border border-line bg-white px-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </Field>
            {formError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-loss">{formError}</p> : null}
            <button
              type="button"
              disabled={isInvalid || isLoading}
              onClick={runCalculation}
              className="h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isLoading ? "Đang tính..." : "Tính toán"}
            </button>
          </div>
        </section>

        <section className="grid gap-6">
          {warning ? <div className="rounded-lg border border-gold/30 bg-amber-50 p-4 text-sm text-amber-800">{warning}</div> : null}
          {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-loss">{error}</div> : null}

          <div>
            <h2 className="mb-3 text-lg font-semibold text-ink">Kết quả</h2>
            {isLoading ? (
              <LoadingSkeleton />
            ) : result ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard label="Tổng đầu tư" value={money(result.dca.totalInvested)} />
                <StatCard label="Tổng BTC tích lũy" value={formatBTC(result.dca.totalBTC)} />
                <StatCard label="Giá vốn trung bình" value={money(result.dca.avgCost)} />
                <StatCard label="Giá trị hiện tại" value={money(result.dca.currentValue)} />
                <StatCard label="Lãi/Lỗ" value={money(result.dca.pnlUSD)} tone={pnlTone} />
                <StatCard label="Lãi/Lỗ %" value={formatPercent(result.dca.pnlPercent)} tone={pnlTone} />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-muted">
                Nhập thông tin và bấm Tính toán để xem kết quả backtest.
              </div>
            )}
          </div>

          {result ? (
            <>
              <section className="rounded-lg border border-line bg-panel p-4 shadow-sm">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">Giá trị danh mục</h2>
                    <p className="text-sm text-muted">
                      {result.purchaseCount} lần mua từ {result.effectiveStart} đến {form.endDate}
                    </p>
                  </div>
                  <p className="text-sm text-muted">BTC hiện tại: {money(result.currentPrice)}</p>
                </div>
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
                      <CartesianGrid stroke="#E4E7EC" strokeDasharray="4 4" />
                      <XAxis dataKey="date" minTickGap={28} tick={{ fontSize: 12, fill: "#667085" }} />
                      <YAxis
                        width={72}
                        tick={{ fontSize: 12, fill: "#667085" }}
                        tickFormatter={(value) =>
                          new Intl.NumberFormat("en-US", {
                            notation: "compact",
                            maximumFractionDigits: 1
                          }).format(currency === "VND" ? value * usdVndRate : value)
                        }
                      />
                      <Tooltip content={<ChartTooltip currency={currency} rate={usdVndRate} />} />
                      <Line
                        type="monotone"
                        dataKey="portfolioValue"
                        name="Giá trị danh mục"
                        stroke="#0F766E"
                        strokeWidth={3}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="invested"
                        name="Tổng tiền đã bỏ vào"
                        stroke="#F59E0B"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-lg border border-line bg-panel p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">So sánh DCA vs Lump Sum</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-muted">
                        <th className="py-3 pr-4 font-semibold">Chiến lược</th>
                        <th className="py-3 pr-4 font-semibold">BTC</th>
                        <th className="py-3 pr-4 font-semibold">Giá trị hiện tại</th>
                        <th className="py-3 pr-4 font-semibold">Lãi/Lỗ</th>
                        <th className="py-3 font-semibold">Lãi/Lỗ %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["DCA", result.dca.totalBTC, result.dca.currentValue, result.dca.pnlUSD, result.dca.pnlPercent],
                        [
                          "Lump Sum",
                          result.lumpSum.btc,
                          result.lumpSum.value,
                          result.lumpSum.pnlUSD,
                          result.lumpSum.pnlPercent
                        ]
                      ].map(([name, btc, value, pnl, percent]) => (
                        <tr key={name} className="border-b border-line last:border-0">
                          <td className="py-3 pr-4 font-semibold text-ink">{name}</td>
                          <td className="py-3 pr-4 text-ink">{formatBTC(btc)}</td>
                          <td className="py-3 pr-4 text-ink">{money(value)}</td>
                          <td className={`py-3 pr-4 font-semibold ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                            {money(pnl)}
                          </td>
                          <td className={`py-3 font-semibold ${percent >= 0 ? "text-gain" : "text-loss"}`}>
                            {formatPercent(percent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={copyShareLink}
                  className="h-11 rounded-lg border border-brand px-4 text-sm font-semibold text-brand transition hover:bg-teal-50"
                >
                  {copied ? "Đã copy link" : "Copy link kết quả"}
                </button>
                <p className="text-sm text-muted">
                  Công cụ chỉ mang tính minh họa dựa trên dữ liệu lịch sử, không phải lời khuyên đầu tư.
                </p>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
