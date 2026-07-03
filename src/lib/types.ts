export type Currency = 'EUR' | 'USD';
export type TransactionType = 'buy' | 'sell';

export type AssetRecord = {
  id: string;
  provider: string;
  providerCoinId: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TransactionRecord = {
  id: string;
  assetId: string;
  assetSymbol: string;
  assetName: string;
  type: TransactionType;
  quantity: string;
  fiatAmount: string;
  fiatCurrency: Currency;
  feeAmount: string | null;
  feeCurrency: Currency | null;
  importBatchId: string | null;
  rowHash: string | null;
  transactionDate: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  asset?: AssetRecord | null;
};

export type PriceQuote = {
  assetId: string;
  price: string;
  currency: Currency;
  source: string;
  capturedAt: string | null;
  stale: boolean;
  warning?: string;
};

export type NormalizedTransactionRecord = TransactionRecord & {
  normalizedFiatAmount: string;
  normalizedFeeAmount: string;
  fxRate: string;
  fxSource: string;
  fxDate: string;
  fxCapturedAt: string | null;
  fxWarning?: string;
};

export type TransactionLedgerEntry = {
  transactionId: string;
  assetId: string;
  assetSymbol: string;
  assetName: string;
  type: TransactionType;
  quantity: string;
  transactionDate: string;
  fiatAmount: string;
  fiatCurrency: Currency;
  normalizedFiatAmount: string;
  feeAmount: string;
  normalizedFeeAmount: string;
  fxRate: string;
  fxSource: string;
  runningQuantity: string;
  runningAverageCost: string;
  runningCostBasis: string;
  realizedProceeds: string;
  realizedCostBasis: string;
  realizedProfit: string;
  totalFees: string;
};

export type HoldingSummary = {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  imageUrl: string | null;
  quantity: string;
  averageCost: string;
  currentPrice: string;
  currentValue: string;
  totalBuyCost: string;
  costBasis: string;
  unrealizedProfit: string;
  roiPercent: string;
  realizedProfit: string;
  realizedProfitApprox: string;
  totalFees: string;
  allocationPercent: string;
  stalePrice: boolean;
  priceSource: string | null;
  priceCapturedAt: string | null;
  priceStatus: 'fresh' | 'stale' | 'missing';
  ledger: TransactionLedgerEntry[];
};

export type PortfolioTotals = {
  baseCurrency: Currency;
  currentValue: string;
  investedAmount: string;
  totalBuyCost: string;
  unrealizedProfit: string;
  roiPercent: string;
  realizedProfit: string;
  realizedProfitApprox: string;
  totalFees: string;
  stalePriceCount: number;
  missingPriceCount: number;
  fxWarningCount: number;
};

export type ChartPoint = {
  label: string;
  value: string;
};

export type PortfolioOverview = {
  totals: PortfolioTotals;
  holdings: HoldingSummary[];
  allocation: ChartPoint[];
  portfolioSeries: ChartPoint[];
  priceWarnings: string[];
  fxWarnings: string[];
  bestPerformer: HoldingSummary | null;
  worstPerformer: HoldingSummary | null;
};
