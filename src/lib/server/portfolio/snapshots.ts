import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import type {
  AssetRecord,
  Currency,
  HoldingSummary,
  PortfolioSnapshotPoint,
  PortfolioSnapshotPriceStatus,
  PortfolioSnapshotSeries,
  PortfolioSnapshotType,
  PriceQuote,
  SnapshotRange
} from '$lib/types';
import { calculatePortfolio } from '$lib/portfolio/calculations';
import { db } from '$lib/server/db/client';
import { assets, portfolioSnapshots, type PortfolioSnapshotRow } from '$lib/server/db/schema';
import { normalizeTransactions } from '$lib/server/fx/cache';
import { refreshCurrentPricesForAssets } from '$lib/server/prices/cache';
import { getAppSettings } from '$lib/server/settings';
import { listTransactionsWithAssets } from '$lib/server/transactions';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEVEN_DAY_MIN_HOURLY_POINTS = 24;

export const DEFAULT_SNAPSHOT_RANGE: SnapshotRange = '24h';
export const SNAPSHOT_RANGES: { value: SnapshotRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y', label: '1y' },
  { value: 'all', label: 'All' }
];

export type SnapshotCreateResult = {
  result: 'created' | 'already_exists';
  snapshotType: PortfolioSnapshotType;
  bucket: string;
  snapshot: PortfolioSnapshotRow;
};

function twoDigit(value: number): string {
  return String(value).padStart(2, '0');
}

export function normalizeSnapshotBucket(
  snapshotType: PortfolioSnapshotType,
  date = new Date()
): string {
  if (snapshotType === 'hourly') {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours())
    ).toISOString();
  }

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  ).toISOString();
}

function activeAssetRecords(holdings: HoldingSummary[]): AssetRecord[] {
  const activeIds = new Set(
    holdings
      .filter((holding) => new Decimal(holding.quantity).gt(0))
      .map((holding) => holding.assetId)
  );
  if (activeIds.size === 0) return [];
  return db
    .select()
    .from(assets)
    .all()
    .filter((asset) => activeIds.has(asset.id));
}

function portfolioPriceStatus(
  activeAssets: AssetRecord[],
  quotes: PriceQuote[]
): PortfolioSnapshotPriceStatus {
  if (activeAssets.length === 0) return 'fresh';

  const quoteByAsset = new Map(quotes.map((quote) => [quote.assetId, quote]));
  const hasMissingPrice = activeAssets.some((asset) => {
    const quote = quoteByAsset.get(asset.id);
    return !quote || quote.capturedAt === null;
  });

  if (hasMissingPrice) return 'failed';
  return quotes.some((quote) => quote.stale) ? 'stale' : 'fresh';
}

function snapshotByBucket(
  snapshotType: PortfolioSnapshotType,
  baseCurrency: Currency,
  bucket: string
): PortfolioSnapshotRow | null {
  return (
    db
      .select()
      .from(portfolioSnapshots)
      .where(
        and(
          eq(portfolioSnapshots.snapshotType, snapshotType),
          eq(portfolioSnapshots.baseCurrency, baseCurrency),
          eq(portfolioSnapshots.bucketAt, bucket)
        )
      )
      .limit(1)
      .get() ?? null
  );
}

export async function createPortfolioSnapshot(
  snapshotType: PortfolioSnapshotType,
  options: { now?: Date } = {}
): Promise<SnapshotCreateResult> {
  const settings = getAppSettings();
  const now = options.now ?? new Date();
  const bucket = normalizeSnapshotBucket(snapshotType, now);
  const existing = snapshotByBucket(snapshotType, settings.baseCurrency, bucket);
  if (existing) {
    return { result: 'already_exists', snapshotType, bucket, snapshot: existing };
  }

  const transactions = listTransactionsWithAssets();
  const normalizedTransactions = await normalizeTransactions(transactions, settings.baseCurrency);
  const preliminary = calculatePortfolio(normalizedTransactions, [], settings.baseCurrency);
  const priceAssets = activeAssetRecords(preliminary.holdings);
  const quotes = await refreshCurrentPricesForAssets(
    priceAssets,
    settings.baseCurrency,
    settings.priceProvider
  );
  const calculated = calculatePortfolio(normalizedTransactions, quotes, settings.baseCurrency);
  const capturedAt = now.toISOString();
  const row = {
    id: randomUUID(),
    snapshotType,
    baseCurrency: settings.baseCurrency,
    bucketAt: bucket,
    totalValue: calculated.totals.currentValue,
    totalInvested: calculated.totals.investedAmount,
    unrealizedProfit: calculated.totals.unrealizedProfit,
    roiPercent: calculated.totals.roiPercent,
    holdingsJson: JSON.stringify(calculated.holdings),
    pricesJson: JSON.stringify(quotes),
    priceStatus: portfolioPriceStatus(priceAssets, quotes),
    capturedAt,
    createdAt: capturedAt
  };

  db.insert(portfolioSnapshots)
    .values(row)
    .onConflictDoNothing({
      target: [
        portfolioSnapshots.snapshotType,
        portfolioSnapshots.baseCurrency,
        portfolioSnapshots.bucketAt
      ]
    })
    .run();

  const snapshot = snapshotByBucket(snapshotType, settings.baseCurrency, bucket);
  if (!snapshot) throw new Error('Failed to store portfolio snapshot.');

  return {
    result: snapshot.id === row.id ? 'created' : 'already_exists',
    snapshotType,
    bucket,
    snapshot
  };
}

export function hasPortfolioSnapshots(baseCurrency: Currency): boolean {
  return Boolean(
    db
      .select({ id: portfolioSnapshots.id })
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.baseCurrency, baseCurrency))
      .limit(1)
      .get()
  );
}

export async function ensureInitialPortfolioSnapshot(): Promise<SnapshotCreateResult | null> {
  const settings = getAppSettings();
  if (hasPortfolioSnapshots(settings.baseCurrency)) return null;
  return createPortfolioSnapshot('hourly');
}

function rangeStart(range: SnapshotRange, now: Date): string | null {
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
  snapshotType: PortfolioSnapshotType,
  baseCurrency: Currency,
  since: string | null
): PortfolioSnapshotRow[] {
  const rows = db
    .select()
    .from(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.snapshotType, snapshotType),
        eq(portfolioSnapshots.baseCurrency, baseCurrency)
      )
    )
    .orderBy(asc(portfolioSnapshots.bucketAt))
    .all();

  return since ? rows.filter((row) => row.bucketAt >= since) : rows;
}

function pointLabel(row: PortfolioSnapshotRow, range: SnapshotRange): string {
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

function toPoint(row: PortfolioSnapshotRow, range: SnapshotRange): PortfolioSnapshotPoint {
  return {
    label: pointLabel(row, range),
    value: row.totalValue,
    bucketAt: row.bucketAt,
    capturedAt: row.capturedAt,
    priceStatus: row.priceStatus,
    snapshotType: row.snapshotType
  };
}

export function parseSnapshotRange(value: string | null | undefined): SnapshotRange {
  return SNAPSHOT_RANGES.some((range) => range.value === value)
    ? (value as SnapshotRange)
    : DEFAULT_SNAPSHOT_RANGE;
}

export function listPortfolioSnapshotSeries(
  baseCurrency: Currency,
  range: SnapshotRange = DEFAULT_SNAPSHOT_RANGE,
  now = new Date()
): PortfolioSnapshotSeries {
  const since = rangeStart(range, now);
  const hasSnapshots = hasPortfolioSnapshots(baseCurrency);

  if (range === '7d') {
    const hourly = snapshotRows('hourly', baseCurrency, since);
    const daily = snapshotRows('daily', baseCurrency, since);
    const useDaily = hourly.length < SEVEN_DAY_MIN_HOURLY_POINTS && daily.length > 0;
    const rows = useDaily ? daily : hourly;
    return {
      range,
      snapshotType: useDaily ? 'daily' : 'hourly',
      usedFallback: useDaily,
      hasSnapshots,
      points: rows.map((row) => toPoint(row, range))
    };
  }

  const snapshotType = range === '24h' ? 'hourly' : 'daily';
  const rows = snapshotRows(snapshotType, baseCurrency, since);
  return {
    range,
    snapshotType,
    usedFallback: false,
    hasSnapshots,
    points: rows.map((row) => toPoint(row, range))
  };
}
