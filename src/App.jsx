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
  "daily",
  "weekly",
  "biweekly",
  "monthly"
];

const LANGUAGES = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" }
];

const TRANSLATIONS = {
  vi: {
    subtitle: "Backtest chiến lược mua BTC định kỳ bằng dữ liệu Binance.",
    amountLabel: "Số tiền mỗi lần mua (USD)",
    chartTitle: "Giá trị danh mục",
    comparisonTitle: "So sánh DCA vs Lump Sum",
    copyLink: "Copy link kết quả",
    copiedLink: "Đã copy link",
    currentBtc: "BTC hiện tại",
    disclaimer: "Công cụ chỉ mang tính minh họa dựa trên dữ liệu lịch sử, không phải lời khuyên đầu tư.",
    emptyState: "Nhập thông tin và bấm Tính toán để xem kết quả backtest.",
    endDate: "Ngày kết thúc",
    frequency: "Tần suất",
    inputTitle: "Thông tin đầu tư",
    language: "Ngôn ngữ",
    loading: "Đang tính...",
    purchaseCount: "lần mua từ",
    resultsTitle: "Kết quả",
    startDate: "Ngày bắt đầu",
    submit: "Tính toán",
    tableStrategy: "Chiến lược",
    tableValue: "Giá trị hiện tại",
    totalInvested: "Tổng đầu tư",
    totalBtc: "Tổng BTC tích lũy",
    avgCost: "Giá vốn trung bình",
    currentValue: "Giá trị hiện tại",
    pnl: "Lãi/Lỗ",
    pnlPercent: "Lãi/Lỗ %",
    portfolioLine: "Giá trị danh mục",
    investedLine: "Tổng tiền đã bỏ vào",
    frequencies: {
      daily: "Hàng ngày",
      weekly: "Hàng tuần",
      biweekly: "Mỗi 2 tuần",
      monthly: "Hàng tháng"
    },
    errors: {
      amount: "Số tiền mỗi lần mua phải lớn hơn 0.",
      dates: "Vui lòng chọn ngày bắt đầu và ngày kết thúc.",
      startFuture: "Ngày bắt đầu không được nằm trong tương lai.",
      endFuture: "Ngày kết thúc không được nằm trong tương lai.",
      dateOrder: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
      copy: "Không copy được link tự động. Vui lòng copy URL trên thanh địa chỉ.",
      calculation: "Không thể tính toán lúc này. Vui lòng thử lại sau hoặc rút ngắn khoảng thời gian."
    },
    warnings: {
      clampedStart: `BTCUSDT trên Binance bắt đầu từ ${EARLIEST_BTCUSDT_DATE}; đã dùng ngày này thay cho ngày bắt đầu.`
    }
  },
  en: {
    subtitle: "Backtest recurring BTC purchases with Binance historical data.",
    amountLabel: "Amount per purchase (USD)",
    chartTitle: "Portfolio value",
    comparisonTitle: "DCA vs Lump Sum",
    copyLink: "Copy result link",
    copiedLink: "Link copied",
    currentBtc: "Current BTC",
    disclaimer: "This tool is for historical illustration only and is not investment advice.",
    emptyState: "Enter your inputs and calculate to view the backtest result.",
    endDate: "End date",
    frequency: "Frequency",
    inputTitle: "Investment inputs",
    language: "Language",
    loading: "Calculating...",
    purchaseCount: "purchases from",
    resultsTitle: "Results",
    startDate: "Start date",
    submit: "Calculate",
    tableStrategy: "Strategy",
    tableValue: "Current value",
    totalInvested: "Total invested",
    totalBtc: "Accumulated BTC",
    avgCost: "Average cost",
    currentValue: "Current value",
    pnl: "Profit/Loss",
    pnlPercent: "Profit/Loss %",
    portfolioLine: "Portfolio value",
    investedLine: "Total invested",
    frequencies: {
      daily: "Daily",
      weekly: "Weekly",
      biweekly: "Every 2 weeks",
      monthly: "Monthly"
    },
    errors: {
      amount: "Amount per purchase must be greater than 0.",
      dates: "Please choose both start and end dates.",
      startFuture: "Start date cannot be in the future.",
      endFuture: "End date cannot be in the future.",
      dateOrder: "Start date must be before or equal to end date.",
      copy: "Could not copy the link automatically. Please copy the browser URL.",
      calculation: "Unable to calculate right now. Please try again later or shorten the date range."
    },
    warnings: {
      clampedStart: `Binance BTCUSDT data starts on ${EARLIEST_BTCUSDT_DATE}; this date was used as the start date.`
    }
  },
  es: {
    subtitle: "Haz backtest de compras recurrentes de BTC con datos históricos de Binance.",
    amountLabel: "Importe por compra (USD)",
    chartTitle: "Valor de la cartera",
    comparisonTitle: "DCA vs inversión única",
    copyLink: "Copiar enlace",
    copiedLink: "Enlace copiado",
    currentBtc: "BTC actual",
    disclaimer: "Esta herramienta solo ilustra datos históricos y no es asesoramiento financiero.",
    emptyState: "Introduce los datos y calcula para ver el backtest.",
    endDate: "Fecha final",
    frequency: "Frecuencia",
    inputTitle: "Datos de inversión",
    language: "Idioma",
    loading: "Calculando...",
    purchaseCount: "compras desde",
    resultsTitle: "Resultados",
    startDate: "Fecha inicial",
    submit: "Calcular",
    tableStrategy: "Estrategia",
    tableValue: "Valor actual",
    totalInvested: "Total invertido",
    totalBtc: "BTC acumulado",
    avgCost: "Coste medio",
    currentValue: "Valor actual",
    pnl: "Ganancia/Pérdida",
    pnlPercent: "Ganancia/Pérdida %",
    portfolioLine: "Valor de la cartera",
    investedLine: "Total invertido",
    frequencies: {
      daily: "Diaria",
      weekly: "Semanal",
      biweekly: "Cada 2 semanas",
      monthly: "Mensual"
    },
    errors: {
      amount: "El importe por compra debe ser mayor que 0.",
      dates: "Selecciona fecha inicial y fecha final.",
      startFuture: "La fecha inicial no puede estar en el futuro.",
      endFuture: "La fecha final no puede estar en el futuro.",
      dateOrder: "La fecha inicial debe ser anterior o igual a la fecha final.",
      copy: "No se pudo copiar el enlace automáticamente. Copia la URL del navegador.",
      calculation: "No se puede calcular ahora. Inténtalo más tarde o acorta el rango de fechas."
    },
    warnings: {
      clampedStart: `Los datos BTCUSDT de Binance empiezan el ${EARLIEST_BTCUSDT_DATE}; se usó esa fecha como inicio.`
    }
  },
  zh: {
    subtitle: "使用 Binance 历史数据回测定投 BTC 策略。",
    amountLabel: "每次购买金额 (USD)",
    chartTitle: "组合价值",
    comparisonTitle: "DCA vs 一次性投资",
    copyLink: "复制结果链接",
    copiedLink: "已复制链接",
    currentBtc: "当前 BTC",
    disclaimer: "本工具仅用于基于历史数据的说明，不构成投资建议。",
    emptyState: "输入参数并点击计算以查看回测结果。",
    endDate: "结束日期",
    frequency: "频率",
    inputTitle: "投资输入",
    language: "语言",
    loading: "计算中...",
    purchaseCount: "次购买，从",
    resultsTitle: "结果",
    startDate: "开始日期",
    submit: "计算",
    tableStrategy: "策略",
    tableValue: "当前价值",
    totalInvested: "总投入",
    totalBtc: "累计 BTC",
    avgCost: "平均成本",
    currentValue: "当前价值",
    pnl: "盈亏",
    pnlPercent: "盈亏 %",
    portfolioLine: "组合价值",
    investedLine: "总投入",
    frequencies: {
      daily: "每日",
      weekly: "每周",
      biweekly: "每两周",
      monthly: "每月"
    },
    errors: {
      amount: "每次购买金额必须大于 0。",
      dates: "请选择开始日期和结束日期。",
      startFuture: "开始日期不能是未来日期。",
      endFuture: "结束日期不能是未来日期。",
      dateOrder: "开始日期必须早于或等于结束日期。",
      copy: "无法自动复制链接。请复制浏览器地址。",
      calculation: "当前无法计算。请稍后重试或缩短日期范围。"
    },
    warnings: {
      clampedStart: `Binance BTCUSDT 数据从 ${EARLIEST_BTCUSDT_DATE} 开始；已使用该日期作为开始日期。`
    }
  },
  ja: {
    subtitle: "Binance の履歴データで BTC の積立戦略をバックテストします。",
    amountLabel: "1回あたりの購入額 (USD)",
    chartTitle: "ポートフォリオ価値",
    comparisonTitle: "DCA vs 一括投資",
    copyLink: "結果リンクをコピー",
    copiedLink: "リンクをコピーしました",
    currentBtc: "現在の BTC",
    disclaimer: "このツールは過去データに基づく参考情報であり、投資助言ではありません。",
    emptyState: "条件を入力して計算するとバックテスト結果が表示されます。",
    endDate: "終了日",
    frequency: "頻度",
    inputTitle: "投資条件",
    language: "言語",
    loading: "計算中...",
    purchaseCount: "回購入、期間",
    resultsTitle: "結果",
    startDate: "開始日",
    submit: "計算",
    tableStrategy: "戦略",
    tableValue: "現在価値",
    totalInvested: "総投資額",
    totalBtc: "累積 BTC",
    avgCost: "平均取得単価",
    currentValue: "現在価値",
    pnl: "損益",
    pnlPercent: "損益 %",
    portfolioLine: "ポートフォリオ価値",
    investedLine: "総投資額",
    frequencies: {
      daily: "毎日",
      weekly: "毎週",
      biweekly: "隔週",
      monthly: "毎月"
    },
    errors: {
      amount: "1回あたりの購入額は 0 より大きくしてください。",
      dates: "開始日と終了日を選択してください。",
      startFuture: "開始日に未来の日付は指定できません。",
      endFuture: "終了日に未来の日付は指定できません。",
      dateOrder: "開始日は終了日以前である必要があります。",
      copy: "リンクを自動コピーできませんでした。ブラウザの URL をコピーしてください。",
      calculation: "現在計算できません。後でもう一度試すか、期間を短くしてください。"
    },
    warnings: {
      clampedStart: `Binance BTCUSDT データは ${EARLIEST_BTCUSDT_DATE} から始まるため、この日付を開始日として使用しました。`
    }
  },
  ko: {
    subtitle: "Binance 과거 데이터로 BTC 정기 매수 전략을 백테스트합니다.",
    amountLabel: "회당 매수 금액 (USD)",
    chartTitle: "포트폴리오 가치",
    comparisonTitle: "DCA vs 일시 매수",
    copyLink: "결과 링크 복사",
    copiedLink: "링크 복사됨",
    currentBtc: "현재 BTC",
    disclaimer: "이 도구는 과거 데이터 기반 예시일 뿐이며 투자 조언이 아닙니다.",
    emptyState: "입력값을 넣고 계산하면 백테스트 결과가 표시됩니다.",
    endDate: "종료일",
    frequency: "주기",
    inputTitle: "투자 입력값",
    language: "언어",
    loading: "계산 중...",
    purchaseCount: "회 매수, 기간",
    resultsTitle: "결과",
    startDate: "시작일",
    submit: "계산",
    tableStrategy: "전략",
    tableValue: "현재 가치",
    totalInvested: "총 투자금",
    totalBtc: "누적 BTC",
    avgCost: "평균 매수가",
    currentValue: "현재 가치",
    pnl: "손익",
    pnlPercent: "손익 %",
    portfolioLine: "포트폴리오 가치",
    investedLine: "총 투자금",
    frequencies: {
      daily: "매일",
      weekly: "매주",
      biweekly: "2주마다",
      monthly: "매월"
    },
    errors: {
      amount: "회당 매수 금액은 0보다 커야 합니다.",
      dates: "시작일과 종료일을 선택해 주세요.",
      startFuture: "시작일은 미래일 수 없습니다.",
      endFuture: "종료일은 미래일 수 없습니다.",
      dateOrder: "시작일은 종료일보다 이전이거나 같아야 합니다.",
      copy: "링크를 자동으로 복사하지 못했습니다. 브라우저 URL을 복사해 주세요.",
      calculation: "지금 계산할 수 없습니다. 나중에 다시 시도하거나 기간을 줄여 주세요."
    },
    warnings: {
      clampedStart: `Binance BTCUSDT 데이터는 ${EARLIEST_BTCUSDT_DATE}부터 시작되어 해당 날짜를 시작일로 사용했습니다.`
    }
  }
};

const DEFAULT_FORM = {
  amount: "100",
  frequency: "weekly",
  startDate: "2021-01-01",
  endDate: todayKey()
};

function readInitialState() {
  const params = new URLSearchParams(window.location.search);
  const lang = LANGUAGES.some((language) => language.value === params.get("lang")) ? params.get("lang") : "vi";
  return {
    form: {
      amount: params.get("amount") || DEFAULT_FORM.amount,
      frequency: params.get("freq") || DEFAULT_FORM.frequency,
      startDate: params.get("start") || DEFAULT_FORM.startDate,
      endDate: params.get("end") || DEFAULT_FORM.endDate
    },
    currency: params.get("cur") === "VND" ? "VND" : "USD",
    language: lang,
    shouldAutoRun: Boolean(params.get("amount") && params.get("freq") && params.get("start"))
  };
}

const initialState = readInitialState();

function buildShareUrl(form, currency, language) {
  const params = new URLSearchParams({
    amount: form.amount,
    freq: form.frequency,
    start: form.startDate,
    end: form.endDate,
    cur: currency,
    lang: language
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

function validateForm(form, t) {
  const amount = Number(form.amount);
  const now = todayKey();
  if (!Number.isFinite(amount) || amount <= 0) return t.errors.amount;
  if (!form.startDate || !form.endDate) return t.errors.dates;
  if (compareDateKeys(form.startDate, now) > 0) return t.errors.startFuture;
  if (compareDateKeys(form.endDate, now) > 0) return t.errors.endFuture;
  if (compareDateKeys(form.startDate, form.endDate) > 0) return t.errors.dateOrder;
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
  const [language, setLanguage] = useState(initialState.language);
  const [usdVndRate, setUsdVndRate] = useState(25400);
  const [result, setResult] = useState(null);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasAutoRunRef = useRef(false);
  const t = TRANSLATIONS[language] || TRANSLATIONS.vi;

  const formError = validateForm(form, t);
  const isInvalid = Boolean(formError);

  const runCalculation = useCallback(async () => {
    const validation = validateForm(form, t);
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
      const localWarning = clampedStart !== form.startDate ? t.warnings.clampedStart : "";
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

      window.history.replaceState(null, "", buildShareUrl({ ...form, startDate: clampedStart }, currency, language));
    } catch (calculationError) {
      setResult(null);
      setError(
        calculationError?.message ||
          t.errors.calculation
      );
    } finally {
      setIsLoading(false);
    }
  }, [currency, form, language, t]);

  useEffect(() => {
    if (initialState.shouldAutoRun && !hasAutoRunRef.current) {
      hasAutoRunRef.current = true;
      runCalculation();
    }
  }, [runCalculation]);

  useEffect(() => {
    if (result) {
      window.history.replaceState(null, "", buildShareUrl(form, currency, language));
    }
  }, [currency, form, language, result]);

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
  const shareUrl = buildShareUrl(form, currency, language);

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setCopied(false);
      setError(t.errors.copy);
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
            <p className="mt-1 text-sm text-muted">{t.subtitle}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="grid gap-1 text-sm font-medium text-ink">
              <span>{t.language}</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="h-11 min-w-36 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              >
                {LANGUAGES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
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
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[360px_1fr]">
        <section className="h-fit rounded-lg border border-line bg-panel p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">{t.inputTitle}</h2>
          <div className="mt-5 grid gap-4">
            <Field label={t.amountLabel}>
              <input
                type="number"
                min="0"
                step="1"
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                className="h-11 rounded-lg border border-line bg-white px-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </Field>
            <Field label={t.frequency}>
              <select
                value={form.frequency}
                onChange={(event) => updateForm("frequency", event.target.value)}
                className="h-11 rounded-lg border border-line bg-white px-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              >
                {FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {t.frequencies[frequency]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.startDate}>
              <input
                type="date"
                value={form.startDate}
                max={todayKey()}
                onChange={(event) => updateForm("startDate", event.target.value)}
                className="h-11 rounded-lg border border-line bg-white px-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </Field>
            <Field label={t.endDate}>
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
              {isLoading ? t.loading : t.submit}
            </button>
          </div>
        </section>

        <section className="grid gap-6">
          {warning ? <div className="rounded-lg border border-gold/30 bg-amber-50 p-4 text-sm text-amber-800">{warning}</div> : null}
          {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-loss">{error}</div> : null}

          <div>
            <h2 className="mb-3 text-lg font-semibold text-ink">{t.resultsTitle}</h2>
            {isLoading ? (
              <LoadingSkeleton />
            ) : result ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard label={t.totalInvested} value={money(result.dca.totalInvested)} />
                <StatCard label={t.totalBtc} value={formatBTC(result.dca.totalBTC)} />
                <StatCard label={t.avgCost} value={money(result.dca.avgCost)} />
                <StatCard label={t.currentValue} value={money(result.dca.currentValue)} />
                <StatCard label={t.pnl} value={money(result.dca.pnlUSD)} tone={pnlTone} />
                <StatCard label={t.pnlPercent} value={formatPercent(result.dca.pnlPercent)} tone={pnlTone} />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-muted">
                {t.emptyState}
              </div>
            )}
          </div>

          {result ? (
            <>
              <section className="rounded-lg border border-line bg-panel p-4 shadow-sm">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">{t.chartTitle}</h2>
                    <p className="text-sm text-muted">
                      {result.purchaseCount} {t.purchaseCount} {result.effectiveStart} - {form.endDate}
                    </p>
                  </div>
                  <p className="text-sm text-muted">{t.currentBtc}: {money(result.currentPrice)}</p>
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
                        name={t.portfolioLine}
                        stroke="#0F766E"
                        strokeWidth={3}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="invested"
                        name={t.investedLine}
                        stroke="#F59E0B"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-lg border border-line bg-panel p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">{t.comparisonTitle}</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-muted">
                        <th className="py-3 pr-4 font-semibold">{t.tableStrategy}</th>
                        <th className="py-3 pr-4 font-semibold">BTC</th>
                        <th className="py-3 pr-4 font-semibold">{t.tableValue}</th>
                        <th className="py-3 pr-4 font-semibold">{t.pnl}</th>
                        <th className="py-3 font-semibold">{t.pnlPercent}</th>
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
                  {copied ? t.copiedLink : t.copyLink}
                </button>
                <p className="text-sm text-muted">{t.disclaimer}</p>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
