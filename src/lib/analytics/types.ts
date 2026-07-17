import type {
  Currency,
  PortfolioSnapshotPriceStatus,
  PortfolioSnapshotType,
  SnapshotRange
} from '$lib/types';

export type AnalyticsRange = SnapshotRange;

export const ANALYTICS_RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y', label: '1y' },
  { value: 'all', label: 'All' }
];

export type AnalyticsHealthStatus = 'healthy' | 'warning' | 'broken';
export type AssetPriceFreshnessStatus = 'fresh' | 'stale' | 'missing' | 'failed';

export type AnalyticsSnapshotPoint = {
  label: string;
  value: string;
  bucketAt: string;
  capturedAt: string;
  snapshotType: PortfolioSnapshotType;
  priceStatus: PortfolioSnapshotPriceStatus;
};

export type AnalyticsSeries = {
  range: AnalyticsRange;
  snapshotType: PortfolioSnapshotType;
  usedFallback: boolean;
  hasSnapshots: boolean;
  incomplete: boolean;
  messages: string[];
  points: AnalyticsSnapshotPoint[];
};

export type AnalyticsPerformanceResponse = {
  currency: Currency;
  series: AnalyticsSeries;
};

export type AnalyticsChangeMetric = {
  range: AnalyticsRange;
  label: string;
  available: boolean;
  valueChange: string | null;
  percentChange: string | null;
  startValue: string | null;
  endValue: string | null;
  startAt: string | null;
  endAt: string | null;
  message?: string;
};

export type AnalyticsSummary = {
  currency: Currency;
  generatedAt: string;
  currentValue: string;
  allTimeHighValue: string | null;
  allTimeHighAt: string | null;
  currentDrawdownPercent: string | null;
  maxDrawdownPercent: string | null;
  totalInvested: string;
  totalProfit: string;
  totalRoiPercent: string;
  timeWeightedReturnPercent: string | null;
  moneyWeightedReturnPercent: string | null;
  financialDataComplete: boolean;
  excludedTransactionCount: number;
  changes: Record<AnalyticsRange, AnalyticsChangeMetric>;
  messages: string[];
};

export type AnalyticsDrawdownPoint = AnalyticsSnapshotPoint & {
  runningAth: string;
  drawdownPercent: string;
};

export type AnalyticsDrawdownResponse = {
  currency: Currency;
  range: AnalyticsRange;
  snapshotType: PortfolioSnapshotType;
  usedFallback: boolean;
  incomplete: boolean;
  messages: string[];
  maxDrawdownPercent: string;
  points: AnalyticsDrawdownPoint[];
};

export type MonthlyContribution = {
  month: string;
  label: string;
  monthlyBuyCost: string;
  monthlySellProceeds: string;
  netContribution: string;
};

export type MonthlyPnl = {
  month: string;
  label: string;
  startValue: string | null;
  endValue: string | null;
  netContribution: string;
  monthlyPnl: string | null;
  complete: boolean;
  message?: string;
};

export type AnalyticsMonthlyResponse = {
  currency: Currency;
  contributions: MonthlyContribution[];
  pnl: MonthlyPnl[];
  financialDataComplete: boolean;
  excludedTransactionCount: number;
};

export type AllocationAsset = {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  currentQuantity: string;
  currentValue: string;
  costBasis: string;
  unrealizedProfit: string;
  realizedProfit: string | null;
  totalProfit: string;
  roiPercent: string;
  allocationPercent: string;
  baselineAllocationPercent: string | null;
  allocationDriftPercent: string | null;
  currentPrice: string;
  priceStatus: AssetPriceFreshnessStatus;
};

export type AllocationConcentration = {
  largestPosition: AllocationAsset | null;
  smallestPosition: AllocationAsset | null;
  topAssetWeightPercent: string;
  thresholdPercent: string;
  status: AnalyticsHealthStatus;
  warning: string | null;
};

export type AnalyticsAllocationResponse = {
  currency: Currency;
  assets: AllocationAsset[];
  concentration: AllocationConcentration;
};

export type SnapshotGap = {
  snapshotType: PortfolioSnapshotType;
  gapStart: string;
  gapEnd: string;
  gapHours: number;
};

export type SnapshotFreshness = {
  snapshotType: PortfolioSnapshotType;
  status: AnalyticsHealthStatus;
  latestBucketAt: string | null;
  latestCapturedAt: string | null;
  ageHours: number | null;
  message: string;
};

export type SnapshotHealth = {
  status: AnalyticsHealthStatus;
  hourly: SnapshotFreshness;
  daily: SnapshotFreshness;
  latestSuccessfulSnapshotAt: string | null;
  failedSnapshotsLast24h: number;
  staleSnapshotsLast24h: number;
};

export type AssetPriceHealth = {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  status: AssetPriceFreshnessStatus;
  latestPrice: string | null;
  latestPriceAt: string | null;
  latestEventStatus: 'success' | 'stale_fallback' | 'failed' | null;
  latestEventAt: string | null;
  message: string;
};

export type PriceHealth = {
  status: AnalyticsHealthStatus;
  latestSuccessfulFetchAt: string | null;
  latestPriceAt: string | null;
  freshCount: number;
  staleCount: number;
  missingCount: number;
  failedCount: number;
  assets: AssetPriceHealth[];
};

export type AnalyticsHealthSummary = {
  status: AnalyticsHealthStatus;
  checkedAt: string;
  snapshotHealth: SnapshotHealth;
  priceHealth: PriceHealth;
  gaps: SnapshotGap[];
  messages: string[];
};
