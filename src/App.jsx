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
  calculateMaxDrawdown,
  calculateYearExtremes,
  calculateYearlyCagr,
  EARLIEST_MARKET_DATE,
  clampStartDate,
  compareDateKeys,
  fetchCurrentPrice,
  fetchHistoricalPrices,
  fetchTopCoins,
  fetchUsdVndRate,
  generatePurchaseDates,
  simulatePortfolioDCA,
  simulatePortfolioLumpSum,
  todayKey
} from "./dcaEngine.js";

const FREQUENCIES = [
  "daily",
  "weekly",
  "biweekly",
  "monthly"
];

const REBALANCE_FREQUENCIES = [
  "never",
  "monthly",
  "quarterly",
  "yearly"
];

const PORTFOLIO_PRESETS = [
  {
    id: "btc",
    label: "BTC 100",
    portfolio: [{ coinId: "bitcoin", allocation: "100" }]
  },
  {
    id: "btc_eth",
    label: "BTC 70 / ETH 30",
    portfolio: [
      { coinId: "bitcoin", allocation: "70" },
      { coinId: "ethereum", allocation: "30" }
    ]
  },
  {
    id: "balanced",
    label: "BTC 50 / ETH 30 / SOL 20",
    portfolio: [
      { coinId: "bitcoin", allocation: "50" },
      { coinId: "ethereum", allocation: "30" },
      { coinId: "solana", allocation: "20" }
    ]
  }
];

function buildTopCoinPreset(coins, label, count = 5) {
  const topCoins = coins.slice(0, count);
  if (topCoins.length === 0) return null;

  const allocations = splitAllocationsEvenly(topCoins.length);
  return {
    id: `top_${topCoins.length}`,
    label,
    portfolio: topCoins.map((coin, index) => ({
      coinId: coin.id,
      allocation: allocations[index]
    }))
  };
}

const LANGUAGES = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" }
];

const SURVEY_STORAGE_KEY = "checkool-survey-dismissed-v1";
const SURVEY_CALCULATION_COUNT_KEY = "checkool-survey-calculation-count-v1";
const SURVEY_FEATURES = [
  "portfolioBacktests",
  "riskMetrics",
  "alerts",
  "taxExport",
  "moreData",
  "mobileUx"
];
const GITHUB_ISSUE_URL = "https://github.com/hieunv6/checkool/issues/new";

const TRANSLATIONS = {
  vi: {
    subtitle: "Backtest chiến lược mua coin định kỳ bằng dữ liệu thị trường lịch sử.",
    coinLabel: "Coin",
    portfolioLabel: "Danh mục DCA",
    allocationLabel: "Phân bổ",
    addCoin: "Thêm coin",
    removeCoin: "Xóa",
    allocationTotal: "Tổng phân bổ",
    holdingsTitle: "Danh mục đang nắm giữ",
    presetLabel: "Mẫu danh mục",
    topFivePreset: "Top 5 coin chia đều",
    rebalanceLabel: "Rebalance",
    maxDrawdown: "Max drawdown",
    bestYear: "Năm tốt nhất",
    worstYear: "Năm tệ nhất",
    strategyComparisonTitle: "So sánh allocation",
    currentStrategy: "Danh mục hiện tại",
    equalWeightStrategy: "Chia đều",
    primaryOnlyStrategy: "Coin đầu tiên 100%",
    exportCsv: "Export CSV",
    survey: {
      title: "Cảm ơn bạn đã dùng Checkool",
      body: "Mình đang cải thiện công cụ này. Bạn muốn ưu tiên thêm tính năng nào tiếp theo?",
      question: "Bạn cần gì nhất?",
      placeholder: "Góp ý thêm nếu bạn muốn...",
      send: "Gửi góp ý",
      later: "Để sau",
      options: {
        portfolioBacktests: "So sánh nhiều danh mục hơn",
        riskMetrics: "Thêm chỉ số rủi ro",
        alerts: "Cảnh báo giá / nhắc lịch DCA",
        taxExport: "Export báo cáo thuế",
        moreData: "Thêm dữ liệu coin / nguồn dữ liệu",
        mobileUx: "Cải thiện trải nghiệm mobile"
      }
    },
    amountLabel: "Số tiền mỗi lần mua (USD)",
    feeLabel: "Phí mỗi lần mua/bán (%)",
    feeHelp: "Áp dụng cho mỗi lần mua và phí bán ước tính khi tính giá trị hiện tại.",
    chartTitle: "Giá trị danh mục",
    comparisonTitle: "So sánh DCA vs Lump Sum",
    copyLink: "Copy link kết quả",
    copiedLink: "Đã copy link",
    currentBtc: "Giá hiện tại",
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
    totalBtc: "Tổng coin tích lũy",
    totalFees: "Tổng phí ước tính",
    avgCost: "Giá vốn trung bình",
    currentValue: "Giá trị hiện tại",
    pnl: "Lãi/Lỗ",
    pnlPercent: "Lãi/Lỗ %",
    portfolioLine: "Giá trị danh mục",
    investedLine: "Tổng tiền đã bỏ vào",
    orderHistoryTitle: "Lịch sử lệnh",
    orderDate: "Ngày",
    orderPrice: "Giá mua",
    orderAmount: "Số tiền",
    orderFee: "Phí",
    orderCoinBought: "Coin mua",
    orderTotalCoin: "Tổng coin",
    yearlyCagrTitle: "CAGR theo từng năm",
    cagrYear: "Năm",
    cagrDate: "Mốc tính",
    cagrValue: "Giá trị danh mục",
    cagrPercent: "CAGR",
    yoyReturn: "YoY return",
    frequencies: {
      daily: "Hàng ngày",
      weekly: "Hàng tuần",
      biweekly: "Mỗi 2 tuần",
      monthly: "Hàng tháng"
    },
    rebalanceFrequencies: {
      never: "Không rebalance",
      monthly: "Hàng tháng",
      quarterly: "Hàng quý",
      yearly: "Hàng năm"
    },
    errors: {
      amount: "Số tiền mỗi lần mua phải lớn hơn 0.",
      allocation: "Tổng phân bổ danh mục phải bằng 100%.",
      duplicateCoin: "Mỗi coin chỉ nên xuất hiện một lần trong danh mục.",
      fee: "Phí giao dịch phải từ 0 đến dưới 100%.",
      dates: "Vui lòng chọn ngày bắt đầu và ngày kết thúc.",
      startFuture: "Ngày bắt đầu không được nằm trong tương lai.",
      endFuture: "Ngày kết thúc không được nằm trong tương lai.",
      dateOrder: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
      copy: "Không copy được link tự động. Vui lòng copy URL trên thanh địa chỉ.",
      calculation: "Không thể tính toán lúc này. Vui lòng thử lại sau hoặc rút ngắn khoảng thời gian."
    },
    warnings: {
      clampedStart: `Dữ liệu thị trường bắt đầu từ ${EARLIEST_MARKET_DATE}; đã dùng ngày này thay cho ngày bắt đầu.`
    }
  },
  en: {
    subtitle: "Backtest recurring crypto purchases with historical market data.",
    coinLabel: "Coin",
    portfolioLabel: "DCA portfolio",
    allocationLabel: "Allocation",
    addCoin: "Add coin",
    removeCoin: "Remove",
    allocationTotal: "Total allocation",
    holdingsTitle: "Portfolio holdings",
    presetLabel: "Portfolio presets",
    topFivePreset: "Top 5 equal weight",
    rebalanceLabel: "Rebalance",
    maxDrawdown: "Max drawdown",
    bestYear: "Best year",
    worstYear: "Worst year",
    strategyComparisonTitle: "Allocation comparison",
    currentStrategy: "Current portfolio",
    equalWeightStrategy: "Equal weight",
    primaryOnlyStrategy: "First coin 100%",
    exportCsv: "Export CSV",
    survey: {
      title: "Thanks for using Checkool",
      body: "I am improving this tool. Which feature should be prioritized next?",
      question: "What do you need most?",
      placeholder: "Add more context if you want...",
      send: "Send feedback",
      later: "Maybe later",
      options: {
        portfolioBacktests: "Compare more portfolios",
        riskMetrics: "More risk metrics",
        alerts: "Price alerts / DCA reminders",
        taxExport: "Tax report export",
        moreData: "More coin data / data sources",
        mobileUx: "Better mobile experience"
      }
    },
    amountLabel: "Amount per purchase (USD)",
    feeLabel: "Fee per buy/sell (%)",
    feeHelp: "Applied to every purchase and the estimated sale fee used for current value.",
    chartTitle: "Portfolio value",
    comparisonTitle: "DCA vs Lump Sum",
    copyLink: "Copy result link",
    copiedLink: "Link copied",
    currentBtc: "Current price",
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
    totalBtc: "Accumulated coin",
    totalFees: "Estimated total fees",
    avgCost: "Average cost",
    currentValue: "Current value",
    pnl: "Profit/Loss",
    pnlPercent: "Profit/Loss %",
    portfolioLine: "Portfolio value",
    investedLine: "Total invested",
    orderHistoryTitle: "Order history",
    orderDate: "Date",
    orderPrice: "Buy price",
    orderAmount: "Amount",
    orderFee: "Fee",
    orderCoinBought: "Coin bought",
    orderTotalCoin: "Total coin",
    yearlyCagrTitle: "Yearly CAGR",
    cagrYear: "Year",
    cagrDate: "As of",
    cagrValue: "Portfolio value",
    cagrPercent: "CAGR",
    yoyReturn: "YoY return",
    frequencies: {
      daily: "Daily",
      weekly: "Weekly",
      biweekly: "Every 2 weeks",
      monthly: "Monthly"
    },
    rebalanceFrequencies: {
      never: "No rebalance",
      monthly: "Monthly",
      quarterly: "Quarterly",
      yearly: "Yearly"
    },
    errors: {
      amount: "Amount per purchase must be greater than 0.",
      allocation: "Portfolio allocation must total 100%.",
      duplicateCoin: "Each coin should appear only once in the portfolio.",
      fee: "Trading fee must be from 0 to under 100%.",
      dates: "Please choose both start and end dates.",
      startFuture: "Start date cannot be in the future.",
      endFuture: "End date cannot be in the future.",
      dateOrder: "Start date must be before or equal to end date.",
      copy: "Could not copy the link automatically. Please copy the browser URL.",
      calculation: "Unable to calculate right now. Please try again later or shorten the date range."
    },
    warnings: {
      clampedStart: `Market data starts on ${EARLIEST_MARKET_DATE}; this date was used as the start date.`
    }
  },
  es: {
    subtitle: "Haz backtest de compras recurrentes de cripto con datos históricos de mercado.",
    coinLabel: "Coin",
    portfolioLabel: "Cartera DCA",
    allocationLabel: "Asignación",
    addCoin: "Añadir coin",
    removeCoin: "Eliminar",
    allocationTotal: "Asignación total",
    holdingsTitle: "Posiciones de cartera",
    presetLabel: "Plantillas",
    topFivePreset: "Top 5 peso igual",
    rebalanceLabel: "Rebalanceo",
    maxDrawdown: "Max drawdown",
    bestYear: "Mejor año",
    worstYear: "Peor año",
    strategyComparisonTitle: "Comparar asignación",
    currentStrategy: "Cartera actual",
    equalWeightStrategy: "Peso igual",
    primaryOnlyStrategy: "Primer coin 100%",
    exportCsv: "Exportar CSV",
    amountLabel: "Importe por compra (USD)",
    feeLabel: "Comisión por compra/venta (%)",
    feeHelp: "Se aplica a cada compra y a la comisión de venta estimada para el valor actual.",
    chartTitle: "Valor de la cartera",
    comparisonTitle: "DCA vs inversión única",
    copyLink: "Copiar enlace",
    copiedLink: "Enlace copiado",
    currentBtc: "Precio actual",
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
    totalBtc: "Coin acumulado",
    totalFees: "Comisiones estimadas",
    avgCost: "Coste medio",
    currentValue: "Valor actual",
    pnl: "Ganancia/Pérdida",
    pnlPercent: "Ganancia/Pérdida %",
    portfolioLine: "Valor de la cartera",
    investedLine: "Total invertido",
    orderHistoryTitle: "Historial de órdenes",
    orderDate: "Fecha",
    orderPrice: "Precio de compra",
    orderAmount: "Importe",
    orderFee: "Comisión",
    orderCoinBought: "Coin comprado",
    orderTotalCoin: "Coin total",
    yearlyCagrTitle: "CAGR por año",
    cagrYear: "Año",
    cagrDate: "Fecha",
    cagrValue: "Valor de cartera",
    cagrPercent: "CAGR",
    yoyReturn: "Retorno YoY",
    frequencies: {
      daily: "Diaria",
      weekly: "Semanal",
      biweekly: "Cada 2 semanas",
      monthly: "Mensual"
    },
    rebalanceFrequencies: {
      never: "Sin rebalanceo",
      monthly: "Mensual",
      quarterly: "Trimestral",
      yearly: "Anual"
    },
    errors: {
      amount: "El importe por compra debe ser mayor que 0.",
      allocation: "La asignación de cartera debe sumar 100%.",
      duplicateCoin: "Cada coin debe aparecer solo una vez en la cartera.",
      fee: "La comisión debe estar entre 0 y menos de 100%.",
      dates: "Selecciona fecha inicial y fecha final.",
      startFuture: "La fecha inicial no puede estar en el futuro.",
      endFuture: "La fecha final no puede estar en el futuro.",
      dateOrder: "La fecha inicial debe ser anterior o igual a la fecha final.",
      copy: "No se pudo copiar el enlace automáticamente. Copia la URL del navegador.",
      calculation: "No se puede calcular ahora. Inténtalo más tarde o acorta el rango de fechas."
    },
    warnings: {
      clampedStart: `Los datos de mercado empiezan el ${EARLIEST_MARKET_DATE}; se usó esa fecha como inicio.`
    }
  },
  zh: {
    subtitle: "使用历史市场数据回测加密货币定投策略。",
    coinLabel: "币种",
    portfolioLabel: "DCA 组合",
    allocationLabel: "配置",
    addCoin: "添加币种",
    removeCoin: "删除",
    allocationTotal: "总配置",
    holdingsTitle: "组合持仓",
    presetLabel: "组合模板",
    topFivePreset: "Top 5 等权重",
    rebalanceLabel: "再平衡",
    maxDrawdown: "最大回撤",
    bestYear: "最佳年份",
    worstYear: "最差年份",
    strategyComparisonTitle: "配置对比",
    currentStrategy: "当前组合",
    equalWeightStrategy: "等权重",
    primaryOnlyStrategy: "首个币种 100%",
    exportCsv: "导出 CSV",
    amountLabel: "每次购买金额 (USD)",
    feeLabel: "每次买/卖手续费 (%)",
    feeHelp: "适用于每次买入，并在计算当前价值时估算卖出手续费。",
    chartTitle: "组合价值",
    comparisonTitle: "DCA vs 一次性投资",
    copyLink: "复制结果链接",
    copiedLink: "已复制链接",
    currentBtc: "当前价格",
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
    totalBtc: "累计币数量",
    totalFees: "预计总手续费",
    avgCost: "平均成本",
    currentValue: "当前价值",
    pnl: "盈亏",
    pnlPercent: "盈亏 %",
    portfolioLine: "组合价值",
    investedLine: "总投入",
    orderHistoryTitle: "订单历史",
    orderDate: "日期",
    orderPrice: "买入价格",
    orderAmount: "金额",
    orderFee: "手续费",
    orderCoinBought: "买入数量",
    orderTotalCoin: "累计数量",
    yearlyCagrTitle: "年度 CAGR",
    cagrYear: "年份",
    cagrDate: "截至日期",
    cagrValue: "组合价值",
    cagrPercent: "CAGR",
    yoyReturn: "同比回报",
    frequencies: {
      daily: "每日",
      weekly: "每周",
      biweekly: "每两周",
      monthly: "每月"
    },
    rebalanceFrequencies: {
      never: "不再平衡",
      monthly: "每月",
      quarterly: "每季度",
      yearly: "每年"
    },
    errors: {
      amount: "每次购买金额必须大于 0。",
      allocation: "组合配置总和必须为 100%。",
      duplicateCoin: "每个币种在组合中只能出现一次。",
      fee: "交易手续费必须大于等于 0 且小于 100%。",
      dates: "请选择开始日期和结束日期。",
      startFuture: "开始日期不能是未来日期。",
      endFuture: "结束日期不能是未来日期。",
      dateOrder: "开始日期必须早于或等于结束日期。",
      copy: "无法自动复制链接。请复制浏览器地址。",
      calculation: "当前无法计算。请稍后重试或缩短日期范围。"
    },
    warnings: {
      clampedStart: `市场数据从 ${EARLIEST_MARKET_DATE} 开始；已使用该日期作为开始日期。`
    }
  },
  ja: {
    subtitle: "履歴市場データで暗号資産の積立戦略をバックテストします。",
    coinLabel: "コイン",
    portfolioLabel: "DCA ポートフォリオ",
    allocationLabel: "配分",
    addCoin: "コイン追加",
    removeCoin: "削除",
    allocationTotal: "合計配分",
    holdingsTitle: "保有ポートフォリオ",
    presetLabel: "プリセット",
    topFivePreset: "Top 5 均等配分",
    rebalanceLabel: "リバランス",
    maxDrawdown: "最大ドローダウン",
    bestYear: "ベスト年",
    worstYear: "ワースト年",
    strategyComparisonTitle: "配分比較",
    currentStrategy: "現在の配分",
    equalWeightStrategy: "均等配分",
    primaryOnlyStrategy: "先頭コイン 100%",
    exportCsv: "CSV 出力",
    amountLabel: "1回あたりの購入額 (USD)",
    feeLabel: "売買ごとの手数料 (%)",
    feeHelp: "各購入と、現在価値を計算する際の推定売却手数料に適用されます。",
    chartTitle: "ポートフォリオ価値",
    comparisonTitle: "DCA vs 一括投資",
    copyLink: "結果リンクをコピー",
    copiedLink: "リンクをコピーしました",
    currentBtc: "現在価格",
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
    totalBtc: "累積コイン",
    totalFees: "推定合計手数料",
    avgCost: "平均取得単価",
    currentValue: "現在価値",
    pnl: "損益",
    pnlPercent: "損益 %",
    portfolioLine: "ポートフォリオ価値",
    investedLine: "総投資額",
    orderHistoryTitle: "注文履歴",
    orderDate: "日付",
    orderPrice: "購入価格",
    orderAmount: "金額",
    orderFee: "手数料",
    orderCoinBought: "購入数量",
    orderTotalCoin: "累積数量",
    yearlyCagrTitle: "年別 CAGR",
    cagrYear: "年",
    cagrDate: "基準日",
    cagrValue: "ポートフォリオ価値",
    cagrPercent: "CAGR",
    yoyReturn: "前年比リターン",
    frequencies: {
      daily: "毎日",
      weekly: "毎週",
      biweekly: "隔週",
      monthly: "毎月"
    },
    rebalanceFrequencies: {
      never: "リバランスなし",
      monthly: "毎月",
      quarterly: "四半期",
      yearly: "毎年"
    },
    errors: {
      amount: "1回あたりの購入額は 0 より大きくしてください。",
      allocation: "ポートフォリオ配分の合計は 100% にしてください。",
      duplicateCoin: "同じコインは一度だけ追加してください。",
      fee: "取引手数料は 0 以上 100% 未満にしてください。",
      dates: "開始日と終了日を選択してください。",
      startFuture: "開始日に未来の日付は指定できません。",
      endFuture: "終了日に未来の日付は指定できません。",
      dateOrder: "開始日は終了日以前である必要があります。",
      copy: "リンクを自動コピーできませんでした。ブラウザの URL をコピーしてください。",
      calculation: "現在計算できません。後でもう一度試すか、期間を短くしてください。"
    },
    warnings: {
      clampedStart: `市場データは ${EARLIEST_MARKET_DATE} から始まるため、この日付を開始日として使用しました。`
    }
  },
  ko: {
    subtitle: "과거 시장 데이터로 암호화폐 정기 매수 전략을 백테스트합니다.",
    coinLabel: "코인",
    portfolioLabel: "DCA 포트폴리오",
    allocationLabel: "배분",
    addCoin: "코인 추가",
    removeCoin: "삭제",
    allocationTotal: "총 배분",
    holdingsTitle: "포트폴리오 보유",
    presetLabel: "프리셋",
    topFivePreset: "Top 5 동일 비중",
    rebalanceLabel: "리밸런싱",
    maxDrawdown: "최대 낙폭",
    bestYear: "최고 연도",
    worstYear: "최악 연도",
    strategyComparisonTitle: "배분 비교",
    currentStrategy: "현재 포트폴리오",
    equalWeightStrategy: "동일 비중",
    primaryOnlyStrategy: "첫 코인 100%",
    exportCsv: "CSV 내보내기",
    amountLabel: "회당 매수 금액 (USD)",
    feeLabel: "매수/매도당 수수료 (%)",
    feeHelp: "각 매수와 현재 가치 계산 시 추정 매도 수수료에 적용됩니다.",
    chartTitle: "포트폴리오 가치",
    comparisonTitle: "DCA vs 일시 매수",
    copyLink: "결과 링크 복사",
    copiedLink: "링크 복사됨",
    currentBtc: "현재 가격",
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
    totalBtc: "누적 코인",
    totalFees: "예상 총 수수료",
    avgCost: "평균 매수가",
    currentValue: "현재 가치",
    pnl: "손익",
    pnlPercent: "손익 %",
    portfolioLine: "포트폴리오 가치",
    investedLine: "총 투자금",
    orderHistoryTitle: "주문 내역",
    orderDate: "날짜",
    orderPrice: "매수가",
    orderAmount: "금액",
    orderFee: "수수료",
    orderCoinBought: "매수 수량",
    orderTotalCoin: "누적 수량",
    yearlyCagrTitle: "연도별 CAGR",
    cagrYear: "연도",
    cagrDate: "기준일",
    cagrValue: "포트폴리오 가치",
    cagrPercent: "CAGR",
    yoyReturn: "YoY 수익률",
    frequencies: {
      daily: "매일",
      weekly: "매주",
      biweekly: "2주마다",
      monthly: "매월"
    },
    rebalanceFrequencies: {
      never: "리밸런싱 없음",
      monthly: "매월",
      quarterly: "분기별",
      yearly: "매년"
    },
    errors: {
      amount: "회당 매수 금액은 0보다 커야 합니다.",
      allocation: "포트폴리오 배분 합계는 100%여야 합니다.",
      duplicateCoin: "각 코인은 포트폴리오에 한 번만 포함해야 합니다.",
      fee: "거래 수수료는 0 이상 100% 미만이어야 합니다.",
      dates: "시작일과 종료일을 선택해 주세요.",
      startFuture: "시작일은 미래일 수 없습니다.",
      endFuture: "종료일은 미래일 수 없습니다.",
      dateOrder: "시작일은 종료일보다 이전이거나 같아야 합니다.",
      copy: "링크를 자동으로 복사하지 못했습니다. 브라우저 URL을 복사해 주세요.",
      calculation: "지금 계산할 수 없습니다. 나중에 다시 시도하거나 기간을 줄여 주세요."
    },
    warnings: {
      clampedStart: `시장 데이터는 ${EARLIEST_MARKET_DATE}부터 시작되어 해당 날짜를 시작일로 사용했습니다.`
    }
  }
};

const DEFAULT_FORM = {
  portfolio: [{ coinId: "bitcoin", allocation: "100" }],
  amount: "100",
  fee: "0.1",
  frequency: "weekly",
  rebalanceFrequency: "never",
  startDate: "2021-01-01",
  endDate: todayKey()
};

function parsePortfolioParam(params) {
  const portfolioParam = params.get("portfolio");
  if (portfolioParam) {
    const parsed = portfolioParam
      .split(",")
      .map((item) => {
        const [coinId, allocation] = item.split(":");
        return {
          coinId: coinId?.trim(),
          allocation: allocation?.trim() || "0"
        };
      })
      .filter((item) => item.coinId);

    if (parsed.length > 0) return parsed;
  }

  return [{ coinId: params.get("coin") || DEFAULT_FORM.portfolio[0].coinId, allocation: "100" }];
}

function serializePortfolio(portfolio) {
  return portfolio
    .filter((item) => item.coinId)
    .map((item) => `${item.coinId}:${item.allocation}`)
    .join(",");
}

function readInitialState() {
  const params = new URLSearchParams(window.location.search);
  const lang = LANGUAGES.some((language) => language.value === params.get("lang")) ? params.get("lang") : "en";
  return {
    form: {
      portfolio: parsePortfolioParam(params),
      amount: params.get("amount") || DEFAULT_FORM.amount,
      fee: params.get("fee") || DEFAULT_FORM.fee,
      frequency: params.get("freq") || DEFAULT_FORM.frequency,
      rebalanceFrequency: REBALANCE_FREQUENCIES.includes(params.get("rebalance"))
        ? params.get("rebalance")
        : DEFAULT_FORM.rebalanceFrequency,
      startDate: params.get("start") || DEFAULT_FORM.startDate,
      endDate: params.get("end") || DEFAULT_FORM.endDate
    },
    currency: params.get("cur") === "VND" ? "VND" : "USD",
    language: lang,
    shouldAutoRun: true
  };
}

const initialState = readInitialState();

function buildShareUrl(form, currency, language) {
  const params = new URLSearchParams({
    amount: form.amount,
    portfolio: serializePortfolio(form.portfolio),
    fee: form.fee,
    freq: form.frequency,
    rebalance: form.rebalanceFrequency,
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

function formatCoinAmount(value, symbol) {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  }).format(value)} ${symbol || ""}`.trim();
}

function formatPercent(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function useIsNarrowViewport(maxWidth = 640) {
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < maxWidth
  );

  useEffect(() => {
    function handleResize() {
      setIsNarrow(window.innerWidth < maxWidth);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [maxWidth]);

  return isNarrow;
}

function validateForm(form, t) {
  const amount = Number(form.amount);
  const fee = Number(form.fee);
  const allocations = Array.isArray(form.portfolio) ? form.portfolio : [];
  const allocationTotal = allocations.reduce((sum, item) => sum + Number(item.allocation || 0), 0);
  const coinIds = allocations.map((item) => item.coinId).filter(Boolean);
  const now = todayKey();
  if (!Number.isFinite(amount) || amount <= 0) return t.errors.amount;
  if (allocations.length === 0 || !Number.isFinite(allocationTotal) || Math.abs(allocationTotal - 100) > 0.01) {
    return t.errors.allocation;
  }
  if (new Set(coinIds).size !== coinIds.length) return t.errors.duplicateCoin;
  if (!Number.isFinite(fee) || fee < 0 || fee >= 100) return t.errors.fee;
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
    <div className="min-w-0 rounded-lg border border-line bg-panel p-4 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-2 break-words text-lg font-semibold sm:text-xl ${toneClass}`}>{value}</p>
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
    <div className="max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-white p-3 text-sm shadow-lg">
      <p className="font-semibold text-ink">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} style={{ color: item.color }}>
          {item.name}: {formatMoney(item.value, currency, rate)}
        </p>
      ))}
    </div>
  );
}

function CoinIcon({ coin, size = "md" }) {
  const [hasError, setHasError] = useState(false);
  const dimension = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  if (!coin?.image || hasError) {
    return (
      <div className={`${dimension} grid shrink-0 place-items-center rounded-full bg-teal-50 font-semibold text-brand ${textSize}`}>
        {(coin?.symbol || "?").slice(0, 3)}
      </div>
    );
  }

  return (
    <img
      src={coin.image}
      alt=""
      className={`${dimension} shrink-0 rounded-full bg-white object-cover`}
      onError={() => setHasError(true)}
    />
  );
}

function CoinCombobox({ coins, selectedCoin, value, onChange, label }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCoins = (normalizedQuery
    ? coins.filter((coin) =>
        [coin.name, coin.symbol, String(coin.marketCapRank), coin.id]
          .filter(Boolean)
          .some((item) => String(item).toLowerCase().includes(normalizedQuery))
      )
    : coins
  ).slice(0, 50);

  function selectCoin(coin) {
    onChange(coin.id);
    setQuery("");
    setIsOpen(false);
  }

  return (
    <div className="relative grid gap-2 text-sm font-medium text-ink">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-line bg-white px-3 py-2 text-left outline-none transition hover:border-brand focus:border-brand focus:ring-2 focus:ring-brand/15"
      >
        <CoinIcon coin={selectedCoin} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink">{selectedCoin.name}</span>
          <span className="block truncate text-xs font-normal text-muted">
            {selectedCoin.symbol}
            {selectedCoin.marketCapRank ? ` · #${selectedCoin.marketCapRank}` : ""}
          </span>
        </span>
        <span className="text-muted">⌄</span>
      </button>

      {isOpen ? (
        <div
          className="absolute left-0 right-0 top-full z-40 mt-2 rounded-lg border border-line bg-white p-2 shadow-xl"
          onMouseDown={(event) => event.preventDefault()}
        >
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search coin, symbol, rank..."
            autoFocus
            onBlur={() => setIsOpen(false)}
            className="h-10 w-full rounded-lg border border-line px-3 text-sm font-normal text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          <div className="mt-2 max-h-[min(18rem,calc(100vh-14rem))] overflow-y-auto">
            {filteredCoins.length > 0 ? (
              filteredCoins.map((coin) => (
                <button
                  key={coin.id}
                  type="button"
                  onClick={() => selectCoin(coin)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-[#F5F7F8] ${
                    value === coin.id ? "bg-teal-50" : ""
                  }`}
                >
                  <CoinIcon coin={coin} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{coin.name}</span>
                    <span className="block truncate text-xs font-normal text-muted">
                      {coin.symbol} · #{coin.marketCapRank}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-sm font-normal text-muted">No coins found.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getCoinMeta(coins, coinId) {
  return (
    coins.find((coin) => coin.id === coinId) ||
    { id: coinId, symbol: coinId === "bitcoin" ? "BTC" : String(coinId || "").toUpperCase(), name: coinId || "Coin" }
  );
}

function formatAllocationValue(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}

function splitAllocationsEvenly(count) {
  const baseCents = Math.floor(10000 / count);
  let remainder = 10000 - baseCents * count;
  return Array.from({ length: count }, () => {
    const cents = baseCents + (remainder > 0 ? 1 : 0);
    remainder -= 1;
    return formatAllocationValue(cents / 100);
  });
}

function PortfolioAllocationEditor({ coins, portfolio, onChange, presets, onApplyPreset, t }) {
  const allocationTotal = portfolio.reduce((sum, item) => sum + Number(item.allocation || 0), 0);

  function updateItem(index, patch) {
    onChange(portfolio.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function addCoin() {
    const existing = new Set(portfolio.map((item) => item.coinId));
    const nextCoin = coins.find((coin) => !existing.has(coin.id)) || { id: "ethereum" };
    const nextPortfolio = [...portfolio, { coinId: nextCoin.id, allocation: "0" }];
    const evenAllocations = splitAllocationsEvenly(nextPortfolio.length);
    onChange(nextPortfolio.map((item, index) => ({ ...item, allocation: evenAllocations[index] })));
  }

  function removeCoin(index) {
    if (portfolio.length <= 1) return;
    onChange(portfolio.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{t.portfolioLabel}</span>
        <span className={`text-xs font-semibold ${Math.abs(allocationTotal - 100) <= 0.01 ? "text-gain" : "text-loss"}`}>
          {t.allocationTotal}: {allocationTotal.toFixed(2).replace(/\.00$/, "")}%
        </span>
      </div>

      <div className="grid gap-2">
        <span className="text-xs font-semibold text-muted">{t.presetLabel}</span>
        <div className="grid grid-cols-1 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApplyPreset(preset.portfolio)}
              className="min-h-9 rounded-lg border border-line bg-white px-3 py-2 text-left text-xs font-semibold text-ink transition hover:border-brand hover:bg-teal-50"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        {portfolio.map((item, index) => {
          const selectedCoin = getCoinMeta(coins, item.coinId);
          return (
            <div key={`${item.coinId}-${index}`} className="rounded-lg border border-line bg-[#F8FAFC] p-3">
              <div className="grid gap-2">
                {/* Coin selector — full width on all screen sizes */}
                <div className="min-w-0">
                  <CoinCombobox
                    coins={coins}
                    selectedCoin={selectedCoin}
                    value={item.coinId}
                    onChange={(coinId) => updateItem(index, { coinId })}
                    label={t.coinLabel}
                  />
                </div>
                {/* Allocation input + remove button side by side */}
                <div className="flex items-end gap-2">
                  <label className="grid flex-1 gap-2 text-sm font-medium text-ink">
                    <span className="whitespace-nowrap">{t.allocationLabel} (%)</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={item.allocation}
                      onChange={(event) => updateItem(index, { allocation: event.target.value })}
                      className="h-12 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={portfolio.length <= 1}
                    onClick={() => removeCoin(index)}
                    title={t.removeCoin}
                    aria-label={t.removeCoin}
                    className="h-12 w-12 shrink-0 rounded-lg border border-line text-lg font-semibold text-muted transition hover:border-red-200 hover:bg-red-50 hover:text-loss disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addCoin}
        className="h-10 rounded-lg border border-brand px-3 text-sm font-semibold text-brand transition hover:bg-teal-50"
      >
        {t.addCoin}
      </button>
    </div>
  );
}

function SimpleDropdown({ label, value, options, onChange, className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) || options[0];

  function selectOption(option) {
    onChange(option.value);
    setIsOpen(false);
  }

  return (
    <div
      className={`relative grid min-w-0 gap-1 text-sm font-medium text-ink ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      {label ? <span>{label}</span> : null}
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 text-left text-sm outline-none transition hover:border-brand focus:border-brand focus:ring-2 focus:ring-brand/15"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selectedOption?.icon ? <span className="shrink-0 text-base">{selectedOption.icon}</span> : null}
          <span className="truncate font-semibold text-ink">{selectedOption?.label}</span>
        </span>
        <span className="shrink-0 text-muted">⌄</span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 rounded-lg border border-line bg-white p-1 shadow-xl">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => selectOption(option)}
              className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-[#F5F7F8] ${
                value === option.value ? "bg-teal-50 text-brand" : "text-ink"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {option.icon ? <span className="shrink-0 text-base">{option.icon}</span> : null}
                <span className="truncate font-semibold">{option.label}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FeatureSurveyModal({ copy, feature, isOpen, note, onClose, onFeatureChange, onNoteChange, onSubmit }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 px-4 py-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">{copy.title}</h2>
            <p className="mt-2 text-sm text-muted">{copy.body}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.later}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-lg font-semibold text-muted transition hover:border-brand hover:bg-teal-50 hover:text-brand"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <p className="text-sm font-semibold text-ink">{copy.question}</p>
          {SURVEY_FEATURES.map((featureId) => (
            <label
              key={featureId}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                feature === featureId ? "border-brand bg-teal-50 text-ink" : "border-line text-muted hover:border-brand"
              }`}
            >
              <input
                type="radio"
                name="feature-survey"
                value={featureId}
                checked={feature === featureId}
                onChange={(event) => onFeatureChange(event.target.value)}
                className="h-4 w-4 accent-brand"
              />
              <span className="font-medium">{copy.options[featureId]}</span>
            </label>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder={copy.placeholder}
          rows={3}
          className="mt-4 w-full resize-none rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-line px-4 text-sm font-semibold text-muted transition hover:border-brand hover:bg-teal-50 hover:text-brand"
          >
            {copy.later}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            {copy.send}
          </button>
        </div>
      </div>
    </div>
  );
}

function buildStrategyComparisons(assetData, purchaseDates, amount, feePercent, rebalanceFrequency) {
  if (assetData.length === 0) return [];

  const equalAllocations = splitAllocationsEvenly(assetData.length).map(Number);
  const strategies = [
    {
      id: "current",
      allocations: assetData.map((asset) => asset.allocationPercent)
    },
    {
      id: "equal",
      allocations: equalAllocations
    },
    {
      id: "primary",
      allocations: assetData.map((_, index) => (index === 0 ? 100 : 0))
    }
  ];

  return strategies.map((strategy) => {
    const strategyAssets = assetData.map((asset, index) => ({
      ...asset,
      allocationPercent: strategy.allocations[index]
    }));
    const dca = simulatePortfolioDCA(strategyAssets, purchaseDates, amount, feePercent, { rebalanceFrequency });
    return {
      id: strategy.id,
      allocationText: strategyAssets
        .filter((asset) => asset.allocationPercent > 0)
        .map((asset) => `${asset.symbol} ${formatAllocationValue(asset.allocationPercent)}%`)
        .join(" / "),
      dca
    };
  });
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [form, setForm] = useState(initialState.form);
  const [currency, setCurrency] = useState(initialState.currency);
  const [language, setLanguage] = useState(initialState.language);
  const [coins, setCoins] = useState([]);
  const [usdVndRate, setUsdVndRate] = useState(25400);
  const [result, setResult] = useState(null);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [surveyFeature, setSurveyFeature] = useState("portfolioBacktests");
  const [surveyNote, setSurveyNote] = useState("");
  const hasAutoRunRef = useRef(false);
  const hasSurveyPromptedRef = useRef(false);
  const isNarrowChart = useIsNarrowViewport(768);
  const t = TRANSLATIONS[language] || TRANSLATIONS.vi;
  const surveyCopy = t.survey || TRANSLATIONS.en.survey;
  const portfolioCoins = form.portfolio.map((item) => ({
    ...item,
    coin: getCoinMeta(coins, item.coinId)
  }));
  const primaryCoin = portfolioCoins[0]?.coin || getCoinMeta(coins, "bitcoin");
  const languageOptions = LANGUAGES.map((item) => ({
    ...item,
    icon: { vi: "VI", en: "EN", es: "ES", zh: "ZH", ja: "JA", ko: "KO" }[item.value]
  }));
  const frequencyOptions = FREQUENCIES.map((frequency) => ({
    value: frequency,
    label: t.frequencies[frequency],
    icon: { daily: "1D", weekly: "7D", biweekly: "14D", monthly: "1M" }[frequency]
  }));
  const portfolioPresets = useMemo(() => {
    const topFivePreset = buildTopCoinPreset(coins, t.topFivePreset, 5);
    return topFivePreset ? [...PORTFOLIO_PRESETS, topFivePreset] : PORTFOLIO_PRESETS;
  }, [coins, t.topFivePreset]);
  const rebalanceOptions = REBALANCE_FREQUENCIES.map((frequency) => ({
    value: frequency,
    label: t.rebalanceFrequencies[frequency],
    icon: { never: "NO", monthly: "1M", quarterly: "3M", yearly: "1Y" }[frequency]
  }));

  const formError = validateForm(form, t);
  const isInvalid = Boolean(formError);

  const runCalculation = useCallback(async ({ countSurvey = true } = {}) => {
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

      const [assetData, rate] = await Promise.all([
        Promise.all(
          form.portfolio.map(async (item) => {
            const coin = getCoinMeta(coins, item.coinId);
            const [prices, currentPrice] = await Promise.all([
              fetchHistoricalPrices(item.coinId, clampedStart, form.endDate),
              fetchCurrentPrice(item.coinId)
            ]);
            return {
              coinId: item.coinId,
              symbol: coin.symbol,
              name: coin.name,
              allocationPercent: Number(item.allocation),
              prices,
              currentPrice
            };
          })
        ),
        fetchUsdVndRate()
      ]);

      const feePercent = Number(form.fee);
      const dca = simulatePortfolioDCA(assetData, purchaseDates, Number(form.amount), feePercent, {
        rebalanceFrequency: form.rebalanceFrequency
      });
      const lumpSum = simulatePortfolioLumpSum(assetData, dca.totalInvested, clampedStart, feePercent);
      const strategyComparisons = buildStrategyComparisons(
        assetData,
        purchaseDates,
        Number(form.amount),
        feePercent,
        form.rebalanceFrequency
      );

      setUsdVndRate(rate);
      setWarning(localWarning);
      if (clampedStart !== form.startDate) {
        setForm((current) => ({ ...current, startDate: clampedStart }));
      }

      setResult({
        dca,
        lumpSum,
        strategyComparisons,
        assets: assetData.map(({ prices, ...asset }) => asset),
        purchaseCount: purchaseDates.length,
        effectiveStart: clampedStart
      });

      if (countSurvey && typeof window !== "undefined" && window.localStorage.getItem(SURVEY_STORAGE_KEY) !== "1") {
        const currentCount = Number(window.localStorage.getItem(SURVEY_CALCULATION_COUNT_KEY) || "0");
        const nextCount = currentCount + 1;
        window.localStorage.setItem(SURVEY_CALCULATION_COUNT_KEY, String(nextCount));
        if (nextCount >= 3 && !hasSurveyPromptedRef.current) {
          hasSurveyPromptedRef.current = true;
          window.setTimeout(() => setIsSurveyOpen(true), 700);
        }
      }

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
  }, [coins, currency, form, language, t]);

  useEffect(() => {
    let isMounted = true;
    fetchTopCoins()
      .then((topCoins) => {
        if (isMounted) setCoins(topCoins);
      })
      .catch(() => {
        if (isMounted) setCoins([]);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (initialState.shouldAutoRun && !hasAutoRunRef.current) {
      hasAutoRunRef.current = true;
      runCalculation({ countSurvey: false });
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
  const yearlyCagr = useMemo(() => {
    if (!result) return [];
    return calculateYearlyCagr(result.dca.snapshots);
  }, [result]);
  const maxDrawdown = useMemo(() => {
    if (!result) return null;
    return calculateMaxDrawdown(result.dca.snapshots);
  }, [result]);
  const yearExtremes = useMemo(() => calculateYearExtremes(yearlyCagr), [yearlyCagr]);

  const money = useCallback((value) => formatMoney(value, currency, usdVndRate), [currency, usdVndRate]);
  const chartNumberFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: isNarrowChart ? 0 : 1
      }),
    [isNarrowChart]
  );
  const chartMargin = isNarrowChart
    ? { top: 8, right: 2, left: -22, bottom: 0 }
    : { top: 12, right: 12, left: 0, bottom: 0 };
  const chartScrollWidth = useMemo(() => {
    if (!isNarrowChart) return "100%";
    const pointWidth = form.frequency === "daily" ? 5 : form.frequency === "monthly" ? 22 : 12;
    return `${Math.min(7200, Math.max(960, chartData.length * pointWidth))}px`;
  }, [chartData.length, form.frequency, isNarrowChart]);
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
    setResult(null);
    setWarning("");
    setError("");
    setCopied(false);
  }

  function updatePortfolio(portfolio) {
    setForm((current) => ({ ...current, portfolio }));
    setResult(null);
    setWarning("");
    setError("");
    setCopied(false);
  }

  function exportResultsCsv() {
    if (!result) return;

    const rows = [
      ["Summary"],
      ["Metric", "Value"],
      ["Total invested", result.dca.totalInvested],
      ["Current value", result.dca.currentValue],
      ["Profit/Loss", result.dca.pnlUSD],
      ["Profit/Loss %", result.dca.pnlPercent],
      ["Max drawdown %", maxDrawdown?.percent],
      ["Max drawdown value", maxDrawdown?.value],
      [],
      ["Holdings"],
      ["Coin", "Symbol", "Invested", "Coin amount", "Average cost", "Fees", "Current value", "PnL", "PnL %"],
      ...result.dca.assets.map((asset) => [
        asset.name,
        asset.symbol,
        asset.totalInvested,
        asset.totalCoin,
        asset.avgCost,
        asset.totalFees,
        asset.currentValue,
        asset.pnlUSD,
        asset.pnlPercent
      ]),
      [],
      ["Yearly CAGR and YoY"],
      ["Year", "Date", "Total invested", "Portfolio value", "CAGR %", "YoY return %"],
      ...yearlyCagr.map((row) => [
        row.year,
        row.date,
        row.totalInvested,
        row.portfolioValue,
        row.cagrPercent,
        row.yoyReturnPercent
      ]),
      [],
      ["Orders"],
      ["Date", "Coin", "Price", "Amount", "Fee", "Coin bought", "Total coin"],
      ...result.dca.orders.map((order) => [
        order.date,
        order.symbol,
        order.price,
        order.amount,
        order.fee,
        order.coinBought,
        order.totalCoin
      ])
    ];

    downloadCsv(`checkool-${form.startDate}-${form.endDate}.csv`, rows);
  }

  function closeSurvey() {
    window.localStorage.setItem(SURVEY_STORAGE_KEY, "1");
    setIsSurveyOpen(false);
  }

  function submitSurvey() {
    const featureLabel = surveyCopy.options[surveyFeature] || surveyFeature;
    const body = [
      `Feature: ${featureLabel}`,
      "",
      "Context:",
      `- Language: ${language}`,
      `- Portfolio: ${form.portfolio.map((item) => `${item.coinId} ${item.allocation}%`).join(" / ")}`,
      `- Frequency: ${form.frequency}`,
      `- Rebalance: ${form.rebalanceFrequency}`,
      "",
      "Note:",
      surveyNote.trim() || "(No extra note)"
    ].join("\n");
    const params = new URLSearchParams({
      title: `Feature request: ${featureLabel}`,
      body
    });
    window.open(`${GITHUB_ISSUE_URL}?${params.toString()}`, "_blank", "noopener,noreferrer");
    closeSurvey();
  }

  return (
    <main className="min-h-screen bg-[#F5F7F8] pb-20 lg:pb-0">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-normal text-ink sm:text-2xl">DCA Crypto Calculator</h1>
            <p className="mt-1 text-sm text-muted">{t.subtitle}</p>
          </div>
          <div className="flex w-full flex-row gap-3 sm:w-auto sm:items-end">
            <SimpleDropdown
              label={t.language}
              value={language}
              options={languageOptions}
              onChange={setLanguage}
              className="flex-1 sm:w-40"
            />
            <div className="inline-flex shrink-0 self-end rounded-lg border border-line bg-[#F8FAFC] p-1 sm:w-fit">
              {["USD", "VND"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCurrency(item)}
                  className={`h-10 min-w-16 flex-1 rounded-md px-4 text-sm font-semibold transition sm:flex-none ${
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

      <div className="mx-auto grid max-w-6xl gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="h-fit rounded-lg border border-line bg-panel p-4 shadow-sm sm:p-5 lg:sticky lg:top-4">
          <h2 className="text-lg font-semibold text-ink">{t.inputTitle}</h2>
          <div className="mt-5 grid gap-4">
            <PortfolioAllocationEditor
              coins={coins}
              portfolio={form.portfolio}
              onChange={updatePortfolio}
              presets={portfolioPresets}
              onApplyPreset={updatePortfolio}
              t={t}
            />
            <Field label={t.amountLabel}>
              <input
                type="number"
                min="0"
                step="1"
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-white px-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            </Field>
            <Field label={t.feeLabel}>
              <input
                type="number"
                min="0"
                max="99.99"
                step="0.01"
                value={form.fee}
                onChange={(event) => updateForm("fee", event.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-white px-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
              <span className="text-xs font-normal text-muted">{t.feeHelp}</span>
            </Field>
            <SimpleDropdown
              label={t.frequency}
              value={form.frequency}
              options={frequencyOptions}
              onChange={(frequency) => updateForm("frequency", frequency)}
            />
            <SimpleDropdown
              label={t.rebalanceLabel}
              value={form.rebalanceFrequency}
              options={rebalanceOptions}
              onChange={(frequency) => updateForm("rebalanceFrequency", frequency)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.startDate}>
                <input
                  type="date"
                  value={form.startDate}
                  max={todayKey()}
                  onChange={(event) => updateForm("startDate", event.target.value)}
                  className="h-11 w-full rounded-lg border border-line bg-white px-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                />
              </Field>
              <Field label={t.endDate}>
                <input
                  type="date"
                  value={form.endDate}
                  max={todayKey()}
                  onChange={(event) => updateForm("endDate", event.target.value)}
                  className="h-11 w-full rounded-lg border border-line bg-white px-3 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                />
              </Field>
            </div>
            {formError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-loss">{formError}</p> : null}
            {/* Nút này chỉ hiện trên desktop — mobile dùng sticky bar bên dưới */}
            <button
              type="button"
              disabled={isInvalid || isLoading}
              onClick={() => runCalculation()}
              className="hidden h-11 w-full rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 lg:block"
            >
              {isLoading ? t.loading : t.submit}
            </button>
          </div>
        </section>

        <section className="grid min-w-0 gap-4 sm:gap-6">
          {warning ? <div className="rounded-lg border border-gold/30 bg-amber-50 p-4 text-sm text-amber-800">{warning}</div> : null}
          {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-loss">{error}</div> : null}

          <div>
            <h2 className="mb-3 text-lg font-semibold text-ink">{t.resultsTitle}</h2>
            {isLoading ? (
              <LoadingSkeleton />
            ) : result ? (
              <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-3">
                <StatCard label={t.totalInvested} value={money(result.dca.totalInvested)} />
                <StatCard label={t.totalFees} value={money(result.dca.totalFees)} />
                <StatCard label={t.currentValue} value={money(result.dca.currentValue)} />
                <StatCard label={t.pnl} value={money(result.dca.pnlUSD)} tone={pnlTone} />
                <StatCard label={t.pnlPercent} value={formatPercent(result.dca.pnlPercent)} tone={pnlTone} />
                <StatCard
                  label={t.maxDrawdown}
                  value={maxDrawdown ? formatPercent(-maxDrawdown.percent) : "-"}
                  tone={maxDrawdown?.percent > 0 ? "loss" : "default"}
                />
                <StatCard
                  label={t.bestYear}
                  value={yearExtremes.best ? `${yearExtremes.best.year} ${formatPercent(yearExtremes.best.yoyReturnPercent)}` : "-"}
                  tone="gain"
                />
                <StatCard
                  label={t.worstYear}
                  value={yearExtremes.worst ? `${yearExtremes.worst.year} ${formatPercent(yearExtremes.worst.yoyReturnPercent)}` : "-"}
                  tone={yearExtremes.worst?.yoyReturnPercent < 0 ? "loss" : "default"}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-muted">
                {t.emptyState}
              </div>
            )}
          </div>

          {result ? (
            <>
              <section className="rounded-lg border border-line bg-panel p-3 shadow-sm sm:p-4">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <CoinIcon coin={primaryCoin} />
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-ink">{t.chartTitle}</h2>
                      <p className="truncate text-sm text-muted">
                        {portfolioCoins.map((item) => `${item.coin.symbol} ${item.allocation}%`).join(" · ")}
                      </p>
                      <p className="text-xs text-muted">
                        {result.purchaseCount} {t.purchaseCount} {result.effectiveStart} → {form.endDate}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted md:flex-col md:items-end md:gap-y-0.5">
                    {result.assets.map((asset) => (
                      <p key={asset.coinId}>
                        {asset.symbol}: {money(asset.currentPrice)}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="chart-scroll min-w-0 overflow-x-auto overflow-y-hidden rounded-md">
                  <div className="h-[280px] min-w-0 sm:h-[320px]" style={{ width: chartScrollWidth }}>
                    <ResponsiveContainer width="100%" height="100%" debounce={50}>
                      <LineChart data={chartData} margin={chartMargin}>
                        <CartesianGrid stroke="#E4E7EC" strokeDasharray="4 4" />
                        <XAxis
                          dataKey="date"
                          interval="preserveStartEnd"
                          minTickGap={isNarrowChart ? 44 : 28}
                          tick={{ fontSize: isNarrowChart ? 10 : 12, fill: "#667085" }}
                          tickLine={false}
                          axisLine={{ stroke: "#E4E7EC" }}
                        />
                        <YAxis
                          width={isNarrowChart ? 46 : 72}
                          tick={{ fontSize: isNarrowChart ? 10 : 12, fill: "#667085" }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) =>
                            chartNumberFormatter.format(currency === "VND" ? value * usdVndRate : value)
                          }
                        />
                        <Tooltip content={<ChartTooltip currency={currency} rate={usdVndRate} />} />
                        <Line
                          type="monotone"
                          dataKey="portfolioValue"
                          name={t.portfolioLine}
                          stroke="#0F766E"
                          strokeWidth={isNarrowChart ? 2 : 3}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="invested"
                          name={t.investedLine}
                          stroke="#F59E0B"
                          strokeWidth={isNarrowChart ? 1.75 : 2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-line bg-panel p-3 shadow-sm sm:p-4">
                <h2 className="text-lg font-semibold text-ink">{t.holdingsTitle}</h2>
                <div className="mt-4 overflow-x-auto rounded-lg border border-line">
                  <table className="w-full border-collapse bg-white text-left text-xs sm:text-sm">
                    <thead className="bg-[#F8FAFC] text-muted">
                      <tr className="border-b border-line">
                        <th className="px-3 py-3 font-semibold">{t.coinLabel}</th>
                        <th className="px-3 py-3 font-semibold">{t.totalInvested}</th>
                        <th className="px-3 py-3 font-semibold">{t.totalBtc}</th>
                        <th className="hidden px-3 py-3 font-semibold sm:table-cell">{t.avgCost}</th>
                        <th className="hidden px-3 py-3 font-semibold sm:table-cell">{t.totalFees}</th>
                        <th className="px-3 py-3 font-semibold">{t.currentValue}</th>
                        <th className="px-3 py-3 font-semibold">{t.pnl}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.dca.assets.map((asset) => (
                        <tr key={asset.coinId} className="border-b border-line last:border-0">
                          <td className="px-3 py-3 font-semibold text-ink">{asset.name}</td>
                          <td className="px-3 py-3 text-ink">{money(asset.totalInvested)}</td>
                          <td className="px-3 py-3 text-ink">{formatCoinAmount(asset.totalCoin, asset.symbol)}</td>
                          <td className="hidden px-3 py-3 text-ink sm:table-cell">{money(asset.avgCost)}</td>
                          <td className="hidden px-3 py-3 text-ink sm:table-cell">{money(asset.totalFees)}</td>
                          <td className="px-3 py-3 text-ink">{money(asset.currentValue)}</td>
                          <td className={`px-3 py-3 font-semibold ${asset.pnlUSD >= 0 ? "text-gain" : "text-loss"}`}>
                            {money(asset.pnlUSD)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-line bg-panel p-3 shadow-sm sm:p-4">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <h2 className="text-lg font-semibold text-ink">{t.orderHistoryTitle}</h2>
                  <p className="text-sm text-muted">
                    {result.dca.snapshots.length} {t.purchaseCount} {result.effectiveStart} - {form.endDate}
                  </p>
                </div>
                <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
                  <table className="w-full border-collapse bg-white text-left text-xs sm:text-sm">
                    <thead className="sticky top-0 z-10 bg-[#F8FAFC] text-muted">
                      <tr className="border-b border-line">
                        <th className="px-3 py-3 font-semibold">{t.orderDate}</th>
                        <th className="px-3 py-3 font-semibold">{t.coinLabel}</th>
                        <th className="px-3 py-3 font-semibold">{t.orderPrice}</th>
                        <th className="px-3 py-3 font-semibold">{t.orderAmount}</th>
                        <th className="hidden px-3 py-3 font-semibold sm:table-cell">{t.orderFee}</th>
                        <th className="px-3 py-3 font-semibold">{t.orderCoinBought}</th>
                        <th className="hidden px-3 py-3 font-semibold sm:table-cell">{t.orderTotalCoin}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.dca.orders.map((order) => (
                        <tr key={`${order.date}-${order.coinId}`} className="border-b border-line last:border-0">
                          <td className="px-3 py-3 font-semibold text-ink">{order.date}</td>
                          <td className="px-3 py-3 font-semibold text-ink">{order.symbol}</td>
                          <td className="px-3 py-3 text-ink">{money(order.price)}</td>
                          <td className="px-3 py-3 text-ink">{money(order.amount)}</td>
                          <td className="hidden px-3 py-3 text-ink sm:table-cell">{money(order.fee)}</td>
                          <td className="px-3 py-3 text-ink">
                            {formatCoinAmount(order.coinBought, order.symbol)}
                          </td>
                          <td className="hidden px-3 py-3 text-ink sm:table-cell">
                            {formatCoinAmount(order.totalCoin, order.symbol)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-line bg-panel p-3 shadow-sm sm:p-4">
                <h2 className="text-lg font-semibold text-ink">{t.yearlyCagrTitle}</h2>
                <div className="mt-4 overflow-x-auto rounded-lg border border-line">
                  <table className="w-full border-collapse bg-white text-left text-xs sm:text-sm">
                    <thead className="bg-[#F8FAFC] text-muted">
                      <tr className="border-b border-line">
                        <th className="px-3 py-3 font-semibold">{t.cagrYear}</th>
                        <th className="hidden px-3 py-3 font-semibold sm:table-cell">{t.cagrDate}</th>
                        <th className="px-3 py-3 font-semibold">{t.totalInvested}</th>
                        <th className="px-3 py-3 font-semibold">{t.cagrValue}</th>
                        <th className="px-3 py-3 font-semibold">{t.cagrPercent}</th>
                        <th className="px-3 py-3 font-semibold">{t.yoyReturn}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyCagr.map((row) => (
                        <tr key={row.year} className="border-b border-line last:border-0">
                          <td className="px-3 py-3 font-semibold text-ink">{row.year}</td>
                          <td className="hidden px-3 py-3 text-ink sm:table-cell">{row.date}</td>
                          <td className="px-3 py-3 text-ink">{money(row.totalInvested)}</td>
                          <td className="px-3 py-3 text-ink">{money(row.portfolioValue)}</td>
                          <td className={`px-3 py-3 font-semibold ${row.cagrPercent >= 0 ? "text-gain" : "text-loss"}`}>
                            {formatPercent(row.cagrPercent)}
                          </td>
                          <td
                            className={`px-3 py-3 font-semibold ${
                              row.yoyReturnPercent === null
                                ? "text-muted"
                                : row.yoyReturnPercent >= 0
                                  ? "text-gain"
                                  : "text-loss"
                            }`}
                          >
                            {row.yoyReturnPercent === null ? "-" : formatPercent(row.yoyReturnPercent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-line bg-panel p-3 shadow-sm sm:p-4">
                <h2 className="text-lg font-semibold text-ink">{t.strategyComparisonTitle}</h2>
                <div className="mt-4 overflow-x-auto rounded-lg border border-line">
                  <table className="w-full border-collapse bg-white text-left text-xs sm:text-sm">
                    <thead className="bg-[#F8FAFC] text-muted">
                      <tr className="border-b border-line">
                        <th className="px-3 py-3 font-semibold">{t.tableStrategy}</th>
                        <th className="hidden px-3 py-3 font-semibold sm:table-cell">{t.allocationLabel}</th>
                        <th className="px-3 py-3 font-semibold">{t.tableValue}</th>
                        <th className="px-3 py-3 font-semibold">{t.pnl}</th>
                        <th className="px-3 py-3 font-semibold">{t.pnlPercent}</th>
                        <th className="hidden px-3 py-3 font-semibold sm:table-cell">{t.maxDrawdown}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.strategyComparisons.map((strategy) => {
                        const strategyDrawdown = calculateMaxDrawdown(strategy.dca.snapshots);
                        const strategyName =
                          strategy.id === "current"
                            ? t.currentStrategy
                            : strategy.id === "equal"
                              ? t.equalWeightStrategy
                              : t.primaryOnlyStrategy;
                        return (
                          <tr key={strategy.id} className="border-b border-line last:border-0">
                            <td className="px-3 py-3 font-semibold text-ink">{strategyName}</td>
                            <td className="hidden px-3 py-3 text-ink sm:table-cell">{strategy.allocationText}</td>
                            <td className="px-3 py-3 text-ink">{money(strategy.dca.currentValue)}</td>
                            <td className={`px-3 py-3 font-semibold ${strategy.dca.pnlUSD >= 0 ? "text-gain" : "text-loss"}`}>
                              {money(strategy.dca.pnlUSD)}
                            </td>
                            <td className={`px-3 py-3 font-semibold ${strategy.dca.pnlPercent >= 0 ? "text-gain" : "text-loss"}`}>
                              {formatPercent(strategy.dca.pnlPercent)}
                            </td>
                            <td className="hidden px-3 py-3 font-semibold text-loss sm:table-cell">
                              {formatPercent(-strategyDrawdown.percent)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-line bg-panel p-3 shadow-sm sm:p-4">
                <h2 className="text-lg font-semibold text-ink">{t.comparisonTitle}</h2>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-line text-muted">
                        <th className="py-3 pr-4 font-semibold">{t.tableStrategy}</th>
                        <th className="hidden py-3 pr-4 font-semibold sm:table-cell">{t.totalFees}</th>
                        <th className="py-3 pr-4 font-semibold">{t.tableValue}</th>
                        <th className="py-3 pr-4 font-semibold">{t.pnl}</th>
                        <th className="py-3 font-semibold">{t.pnlPercent}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        [
                          "DCA",
                          result.dca.totalFees,
                          result.dca.currentValue,
                          result.dca.pnlUSD,
                          result.dca.pnlPercent
                        ],
                        [
                          "Lump Sum",
                          result.lumpSum.totalFees,
                          result.lumpSum.value,
                          result.lumpSum.pnlUSD,
                          result.lumpSum.pnlPercent
                        ]
                      ].map(([name, fees, value, pnl, percent]) => (
                        <tr key={name} className="border-b border-line last:border-0">
                          <td className="py-3 pr-4 font-semibold text-ink">{name}</td>
                          <td className="hidden py-3 pr-4 text-ink sm:table-cell">{money(fees)}</td>
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
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={copyShareLink}
                    className="h-11 w-full rounded-lg border border-brand px-4 text-sm font-semibold text-brand transition hover:bg-teal-50 sm:w-auto"
                  >
                    {copied ? t.copiedLink : t.copyLink}
                  </button>
                  <button
                    type="button"
                    onClick={exportResultsCsv}
                    className="h-11 w-full rounded-lg border border-line px-4 text-sm font-semibold text-ink transition hover:border-brand hover:bg-teal-50 sm:w-auto"
                  >
                    {t.exportCsv}
                  </button>
                </div>
                <p className="text-sm text-muted">{t.disclaimer}</p>
              </div>
            </>
          ) : null}
        </section>
      </div>

      {/* Sticky bottom bar — chỉ hiện trên mobile/tablet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-line bg-white px-4 py-3 lg:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {formError ? (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-loss">{formError}</p>
        ) : null}
        <button
          type="button"
          disabled={isInvalid || isLoading}
          onClick={() => runCalculation()}
          className="h-11 w-full rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isLoading ? t.loading : t.submit}
        </button>
      </div>

      <FeatureSurveyModal
        copy={surveyCopy}
        feature={surveyFeature}
        isOpen={isSurveyOpen}
        note={surveyNote}
        onClose={closeSurvey}
        onFeatureChange={setSurveyFeature}
        onNoteChange={setSurveyNote}
        onSubmit={submitSurvey}
      />
    </main>
  );
}
