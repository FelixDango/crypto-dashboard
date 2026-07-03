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
  realizedProfitApprox: string;
  allocationPercent: string;
  stalePrice: boolean;
};

export type PortfolioTotals = {
  baseCurrency: Currency;
  currentValue: string;
  investedAmount: string;
  totalBuyCost: string;
  unrealizedProfit: string;
  roiPercent: string;
  realizedProfitApprox: string;
  stalePriceCount: number;
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
  bestPerformer: HoldingSummary | null;
  worstPerformer: HoldingSummary | null;
};
