import Decimal from 'decimal.js';
import { and, asc, eq, gte, ne } from 'drizzle-orm';
import { getAllocationConcentrationWarningPercent } from '$lib/env';
import {
  ANALYTICS_RANGES,
  type AnalyticsAllocationResponse,
  type AnalyticsDrawdownResponse,
  type AnalyticsMonthlyResponse,
  type AnalyticsPerformanceResponse,
  type AnalyticsRange,
  type AnalyticsSeries,
  type AnalyticsSnapshotPoint,
  type AnalyticsSummary,
  type AssetPriceFreshnessStatus,
  type PriceHealth
} from '$lib/analytics/types';
import type {
  Currency,
  HoldingSummary,
  NormalizedTransactionRecord,
  PortfolioOverview,
  PortfolioSnapshotType
} from '$lib/types';
import {
  calculateAllocation,
  calculateConcentration,
  calculateDrawdowns,
  calculateMaxDrawdown,
  calculateMoneyWeightedReturn,
  calculateMonthlyContributions,
  calculateMonthlyPnl,
  calculatePeriodChange,
  calculateTimeWeightedReturn
} from '$lib/server/analytics/calculations';
import { getPriceHealth } from '$lib/server/analytics/history-health';
import { db } from '$lib/server/db/client';
import { portfolioSnapshots, type PortfolioSnapshotRow } from '$lib/server/db/schema';
import { normalizeTransactions } from '$lib/server/fx/cache';
import { getPortfolioOverview } from '$lib/server/portfolio/service';
import { getAppSettings } from '$lib/server/settings';
import { listTransactionsWithAssets } from '$lib/server/transactions';
import { moneyText } from '$lib/portfolio/decimal';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function asDecimal(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  return new Decimal(value);
}

function toText(value: Decimal): string {
  if (!value.isFinite()) return '0';
  return moneyText(value);
}

function twoDigit(value: number): string {
  return String(value).padStart(2, '0');
}

function rangeLabel(range: AnalyticsRange): string {
  return ANALYTICS_RANGES.find((item) => item.value === range)?.label ?? range;
}

function rangeStart(range: AnalyticsRange, now: Date): string | null {
  if (range === 'all') return null;

  const start = new Date(now);
  if (range === '24h') {
    start.setUTCHours(start.getUTCHours() - 24);
  } else if (range === '7d') {
    start.setUTCDate(start.getUTCDate() - 7);
  } else if (range === '30d') {
    start.setUTCDate(start.getUTCDate() - 30);
  } else if (range === '90d') {
    start.setUTCDate(start.getUTCDate() - 90);
  } else {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
  }

  return start.toISOString();
}

function snapshotRows(
  baseCurrency: Currency,
  snapshotType?: PortfolioSnapshotType,
  since?: string | null
): PortfolioSnapshotRow[] {
  const rows = db
    .select()
    .from(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.baseCurrency, baseCurrency),
        ne(portfolioSnapshots.priceStatus, 'failed'),
        snapshotType ? eq(portfolioSnapshots.snapshotType, snapshotType) : undefined,
        since ? gte(portfolioSnapshots.bucketAt, since) : undefined
      )
    )
    .orderBy(asc(portfolioSnapshots.bucketAt))
    .all();

  return rows;
}

function pointLabel(row: PortfolioSnapshotRow, range: AnalyticsRange): string {
  const date = new Date(row.bucketAt);
  const month = MONTHS[date.getUTCMonth()];
  const day = twoDigit(date.getUTCDate());

  if (row.snapshotType === 'hourly') {
    return `${month} ${day} ${twoDigit(date.getUTCHours())}:00`;
  }

  if (range === '1y' || range === 'all') {
    return `${month} ${day}, ${date.getUTCFullYear()}`;
  }

  return `${month} ${day}`;
}

function toPoint(row: PortfolioSnapshotRow, range: AnalyticsRange): AnalyticsSnapshotPoint {
  return {
    label: pointLabel(row, range),
    value: row.totalValue,
    bucketAt: row.bucketAt,
    capturedAt: row.capturedAt,
    snapshotType: row.snapshotType,
    priceStatus: row.priceStatus
  };
}

function hasAnySnapshots(baseCurrency: Currency): boolean {
  return snapshotRows(baseCurrency).length > 0;
}

function hasStoredSnapshots(baseCurrency: Currency): boolean {
  return Boolean(
    db
      .select({ id: portfolioSnapshots.id })
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.baseCurrency, baseCurrency))
      .limit(1)
      .get()
  );
}

function expectedCoverageComplete(
  rows: PortfolioSnapshotRow[],
  snapshotType: PortfolioSnapshotType,
  since: string | null,
  now: Date
): boolean {
  if (rows.length < 2) return false;
  if (!since) return true;

  const toleranceMs = snapshotType === 'hourly' ? 90 * 60 * 1000 : 36 * 60 * 60 * 1000;
  const first = new Date(rows[0].bucketAt).getTime();
  const latest = new Date(rows.at(-1)?.bucketAt ?? rows[0].bucketAt).getTime();
  const start = new Date(since).getTime();
  const current = now.getTime();

  if (first - start > toleranceMs) return false;
  if (current - latest > toleranceMs) return false;

  for (let index = 1; index < rows.length; index += 1) {
    const previous = new Date(rows[index - 1].bucketAt).getTime();
    const next = new Date(rows[index].bucketAt).getTime();
    if (next - previous > toleranceMs) return false;
  }

  return true;
}

function seriesMessages(
  range: AnalyticsRange,
  snapshotType: PortfolioSnapshotType,
  rows: PortfolioSnapshotRow[],
  complete: boolean
): string[] {
  if (rows.length < 2) {
    return [`Need at least 2 ${snapshotType} snapshots for ${rangeLabel(range)} analytics.`];
  }

  if (!complete) {
    return [
      `${snapshotType === 'hourly' ? 'Hourly' : 'Daily'} history is incomplete for the selected range.`
    ];
  }

  return [];
}

export function getAnalyticsSnapshotSeries(
  range: AnalyticsRange,
  options: { baseCurrency?: Currency; now?: Date } = {}
): AnalyticsSeries {
  const settings = getAppSettings();
  const baseCurrency = options.baseCurrency ?? settings.baseCurrency;
  const now = options.now ?? new Date();
  const since = rangeStart(range, now);
  const hasSnapshots = hasAnySnapshots(baseCurrency);

  if (range === '7d') {
    const hourly = snapshotRows(baseCurrency, 'hourly', since);
    const hourlyComplete = expectedCoverageComplete(hourly, 'hourly', since, now);

    if (!hourlyComplete) {
      const daily = snapshotRows(baseCurrency, 'daily', since);
      if (daily.length > 0) {
        const dailyComplete = expectedCoverageComplete(daily, 'daily', since, now);
        return {
          range,
          snapshotType: 'daily',
          usedFallback: true,
          hasSnapshots,
          incomplete: !dailyComplete,
          messages: [
            'Hourly history is incomplete for the selected range; using daily snapshots.',
            ...seriesMessages(range, 'daily', daily, dailyComplete)
          ],
          points: daily.map((row) => toPoint(row, range))
        };
      }
    }

    return {
      range,
      snapshotType: 'hourly',
      usedFallback: false,
      hasSnapshots,
      incomplete: !hourlyComplete,
      messages: seriesMessages(range, 'hourly', hourly, hourlyComplete),
      points: hourly.map((row) => toPoint(row, range))
    };
  }

  const snapshotType: PortfolioSnapshotType = range === '24h' ? 'hourly' : 'daily';
  const rows = snapshotRows(baseCurrency, snapshotType, since);
  const complete = expectedCoverageComplete(rows, snapshotType, since, now);

  return {
    range,
    snapshotType,
    usedFallback: false,
    hasSnapshots,
    incomplete: !complete,
    messages: seriesMessages(range, snapshotType, rows, complete),
    points: rows.map((row) => toPoint(row, range))
  };
}

export async function getAnalyticsSummary(
  options: {
    baseCurrency?: Currency;
    now?: Date;
    overview?: PortfolioOverview;
    normalizedTransactions?: NormalizedTransactionRecord[];
  } = {}
): Promise<AnalyticsSummary> {
  const settings = getAppSettings();
  const baseCurrency = options.baseCurrency ?? settings.baseCurrency;
  const generatedAt = (options.now ?? new Date()).toISOString();
  const overview = options.overview ?? (await getPortfolioOverview());
  const normalizedTransactions =
    options.normalizedTransactions ??
    (await normalizeTransactions(listTransactionsWithAssets(), baseCurrency));
  const completeTransactions = normalizedTransactions.filter(
    (transaction) => transaction.fxComplete
  );
  const historicalRows = snapshotRows(baseCurrency);
  const historicalPoints = historicalRows.map((row) => ({
    value: row.totalValue,
    bucketAt: row.bucketAt
  }));
  const currentPoint = {
    value: overview.totals.currentValue,
    bucketAt: generatedAt
  };
  const allPoints = overview.totals.financialDataComplete
    ? [...historicalPoints, currentPoint]
    : historicalPoints;
  const athPoint = allPoints.reduce<typeof currentPoint | null>((best, point) => {
    if (!best || asDecimal(point.value).gt(best.value)) return point;
    return best;
  }, null);
  const drawdowns = calculateDrawdowns(allPoints);
  const currentDrawdown = drawdowns.at(-1)?.drawdownPercent ?? null;
  const changes = Object.fromEntries(
    ANALYTICS_RANGES.map((range) => {
      const series = getAnalyticsSnapshotSeries(range.value, options);
      const message = series.messages[0];
      return [range.value, calculatePeriodChange(series.points, range.value, range.label, message)];
    })
  ) as AnalyticsSummary['changes'];
  const returnSnapshots = snapshotRows(baseCurrency, 'daily').map((row) => ({
    bucketAt: row.bucketAt,
    capturedAt: row.capturedAt,
    value: row.totalValue
  }));
  const timeWeightedReturnPercent = overview.totals.financialDataComplete
    ? calculateTimeWeightedReturn(returnSnapshots, completeTransactions)
    : null;
  const moneyWeightedReturnPercent = overview.totals.financialDataComplete
    ? calculateMoneyWeightedReturn(completeTransactions, overview.totals.currentValue, generatedAt)
    : null;

  return {
    currency: overview.totals.baseCurrency,
    generatedAt,
    currentValue: overview.totals.currentValue,
    allTimeHighValue: athPoint ? toText(asDecimal(athPoint.value)) : null,
    allTimeHighAt: athPoint?.bucketAt ?? null,
    currentDrawdownPercent: currentDrawdown,
    maxDrawdownPercent: historicalPoints.length > 0 ? calculateMaxDrawdown(allPoints) : null,
    totalInvested: overview.totals.totalBuyCost,
    totalProfit: overview.totals.totalProfit,
    totalRoiPercent: overview.totals.roiPercent,
    timeWeightedReturnPercent,
    moneyWeightedReturnPercent,
    financialDataComplete: overview.totals.financialDataComplete,
    excludedTransactionCount: overview.totals.excludedTransactionCount,
    changes,
    messages: [
      ...(overview.totals.excludedTransactionCount > 0
        ? [
            `${overview.totals.excludedTransactionCount} transaction(s) are excluded because FX conversion is unavailable.`
          ]
        : []),
      ...(overview.totals.missingPriceCount > 0
        ? [
            `${overview.totals.missingPriceCount} open position(s) are excluded because a market price is unavailable.`
          ]
        : []),
      ...(historicalRows.length === 0
        ? [
            hasStoredSnapshots(baseCurrency)
              ? 'No usable portfolio snapshots exist yet.'
              : 'No portfolio snapshots exist yet.'
          ]
        : [])
    ]
  };
}

export function getAnalyticsPerformance(
  range: AnalyticsRange,
  options: { baseCurrency?: Currency; now?: Date } = {}
): AnalyticsPerformanceResponse {
  const settings = getAppSettings();
  return {
    currency: options.baseCurrency ?? settings.baseCurrency,
    series: getAnalyticsSnapshotSeries(range, options)
  };
}

export function getAnalyticsDrawdown(
  range: AnalyticsRange,
  options: { baseCurrency?: Currency; now?: Date } = {}
): AnalyticsDrawdownResponse {
  const settings = getAppSettings();
  const series = getAnalyticsSnapshotSeries(range, options);
  const points = calculateDrawdowns(series.points);

  return {
    currency: options.baseCurrency ?? settings.baseCurrency,
    range,
    snapshotType: series.snapshotType,
    usedFallback: series.usedFallback,
    incomplete: series.incomplete,
    messages: series.messages,
    maxDrawdownPercent: calculateMaxDrawdown(series.points),
    points
  };
}

export async function getAnalyticsMonthly(
  options: { baseCurrency?: Currency; normalizedTransactions?: NormalizedTransactionRecord[] } = {}
): Promise<AnalyticsMonthlyResponse> {
  const settings = getAppSettings();
  const baseCurrency = options.baseCurrency ?? settings.baseCurrency;
  const normalizedTransactions =
    options.normalizedTransactions ??
    (await normalizeTransactions(listTransactionsWithAssets(), baseCurrency));
  const completeTransactions = normalizedTransactions.filter(
    (transaction) => transaction.fxComplete
  );
  const excludedTransactionCount = normalizedTransactions.length - completeTransactions.length;
  const contributions = calculateMonthlyContributions(completeTransactions);
  const dailySnapshots = snapshotRows(baseCurrency, 'daily').map((row) => ({
    bucketAt: row.bucketAt,
    capturedAt: row.capturedAt,
    value: row.totalValue
  }));

  return {
    currency: baseCurrency,
    contributions,
    pnl: calculateMonthlyPnl(dailySnapshots, completeTransactions),
    financialDataComplete: excludedTransactionCount === 0,
    excludedTransactionCount
  };
}

function firstSnapshotBaseline(baseCurrency: Currency): Map<string, string> {
  const first = snapshotRows(baseCurrency).sort((a, b) => a.bucketAt.localeCompare(b.bucketAt))[0];
  if (!first) return new Map();

  try {
    const holdings = JSON.parse(first.holdingsJson) as Array<Partial<HoldingSummary>>;
    const totalValue = holdings.reduce(
      (total, holding) => total.plus(holding.currentValue ?? '0'),
      new Decimal(0)
    );

    return new Map(
      holdings
        .filter((holding) => holding.assetId)
        .map((holding) => {
          const allocation =
            holding.allocationPercent ??
            (totalValue.gt(0)
              ? toText(
                  asDecimal(holding.currentValue ?? '0')
                    .div(totalValue)
                    .mul(100)
                )
              : '0');
          return [holding.assetId as string, allocation];
        })
    );
  } catch {
    return new Map();
  }
}

function coercePriceStatus(value: string): AssetPriceFreshnessStatus {
  return value === 'failed' || value === 'stale' || value === 'missing' ? value : 'fresh';
}

export async function getAnalyticsAllocation(
  options: {
    baseCurrency?: Currency;
    overview?: PortfolioOverview;
    priceHealth?: PriceHealth;
  } = {}
): Promise<AnalyticsAllocationResponse> {
  const settings = getAppSettings();
  const baseCurrency = options.baseCurrency ?? settings.baseCurrency;
  const overview = options.overview ?? (await getPortfolioOverview());
  const priceHealth = options.priceHealth ?? (await getPriceHealth({ baseCurrency }));
  const priceStatusByAsset = new Map(
    priceHealth.assets.map((asset) => [asset.assetId, asset.status])
  );
  const baseline = firstSnapshotBaseline(baseCurrency);
  const allocation = calculateAllocation(
    overview.holdings
      .filter((holding) => asDecimal(holding.quantity).gt(0))
      .map((holding) => ({
        assetId: holding.assetId,
        assetSymbol: holding.assetSymbol,
        assetName: holding.assetName,
        currentQuantity: holding.quantity,
        currentValue: holding.currentValue,
        costBasis: holding.costBasis,
        unrealizedProfit: holding.unrealizedProfit,
        realizedProfit: holding.realizedProfit,
        totalProfit: holding.totalProfit,
        roiPercent: holding.roiPercent,
        currentPrice: holding.currentPrice,
        priceStatus: priceStatusByAsset.has(holding.assetId)
          ? (priceStatusByAsset.get(holding.assetId) as AssetPriceFreshnessStatus)
          : coercePriceStatus(holding.priceStatus)
      })),
    baseline
  );

  return {
    currency: overview.totals.baseCurrency,
    assets: allocation,
    concentration: calculateConcentration(allocation, getAllocationConcentrationWarningPercent())
  };
}
