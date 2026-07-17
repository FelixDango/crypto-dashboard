import Decimal from 'decimal.js';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type {
  AnalyticsHealthStatus,
  AnalyticsHealthSummary,
  AssetPriceHealth,
  PriceHealth,
  SnapshotFreshness,
  SnapshotGap,
  SnapshotHealth
} from '$lib/analytics/types';
import type { Currency, NormalizedTransactionRecord, PortfolioSnapshotType } from '$lib/types';
import { calculatePortfolio } from '$lib/portfolio/calculations';
import { db } from '$lib/server/db/client';
import {
  portfolioSnapshots,
  priceSnapshots,
  type PortfolioSnapshotRow,
  type PriceSnapshotRow
} from '$lib/server/db/schema';
import { normalizeTransactions } from '$lib/server/fx/cache';
import {
  listLatestPriceUpdateEvents,
  getLatestSuccessfulPriceUpdateEvent
} from '$lib/server/prices/events';
import { getAppSettings } from '$lib/server/settings';
import { listTransactionsWithAssets } from '$lib/server/transactions';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PRICE_FRESH_MS = 30 * 60 * 1000;
const PRICE_USABLE_MS = 24 * HOUR_MS;

type SnapshotGapInput = {
  bucketAt: string;
};

function asDecimal(value: string | null | undefined): Decimal {
  if (!value) return new Decimal(0);
  return new Decimal(value);
}

function ageHours(value: string, now: Date): number {
  return (now.getTime() - new Date(value).getTime()) / HOUR_MS;
}

function roundedHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function worstStatus(statuses: AnalyticsHealthStatus[]): AnalyticsHealthStatus {
  if (statuses.includes('broken')) return 'broken';
  if (statuses.includes('warning')) return 'warning';
  return 'healthy';
}

function snapshotRows(baseCurrency: Currency, snapshotType?: PortfolioSnapshotType) {
  const rows = db
    .select()
    .from(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.baseCurrency, baseCurrency),
        snapshotType ? eq(portfolioSnapshots.snapshotType, snapshotType) : undefined
      )
    )
    .orderBy(asc(portfolioSnapshots.bucketAt))
    .all();

  return rows;
}

export function detectSnapshotGaps(
  snapshotType: PortfolioSnapshotType,
  rows: SnapshotGapInput[]
): SnapshotGap[] {
  const sorted = [...rows].sort((a, b) => a.bucketAt.localeCompare(b.bucketAt));
  const toleranceMs = snapshotType === 'hourly' ? 90 * 60 * 1000 : 36 * HOUR_MS;

  const gaps: SnapshotGap[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const differenceMs =
      new Date(current.bucketAt).getTime() - new Date(previous.bucketAt).getTime();

    if (differenceMs > toleranceMs) {
      gaps.push({
        snapshotType,
        gapStart: previous.bucketAt,
        gapEnd: current.bucketAt,
        gapHours: roundedHours(differenceMs / HOUR_MS)
      });
    }
  }

  return gaps;
}

export function getHistoryGaps(
  options: { baseCurrency?: Currency; snapshotType?: PortfolioSnapshotType } = {}
): SnapshotGap[] {
  const settings = getAppSettings();
  const baseCurrency = options.baseCurrency ?? settings.baseCurrency;
  const types: PortfolioSnapshotType[] = options.snapshotType
    ? [options.snapshotType]
    : ['hourly', 'daily'];

  return types.flatMap((snapshotType) =>
    detectSnapshotGaps(
      snapshotType,
      snapshotRows(baseCurrency, snapshotType).filter((row) => row.priceStatus !== 'failed')
    )
  );
}

function latestSnapshotFreshness(
  snapshotType: PortfolioSnapshotType,
  rows: PortfolioSnapshotRow[],
  now: Date
): SnapshotFreshness {
  const latest = rows
    .filter((row) => row.snapshotType === snapshotType)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];

  if (!latest) {
    return {
      snapshotType,
      status: 'broken',
      latestBucketAt: null,
      latestCapturedAt: null,
      ageHours: null,
      message: `No ${snapshotType} snapshots exist.`
    };
  }

  const age = ageHours(latest.capturedAt, now);
  const healthyLimit = snapshotType === 'hourly' ? 2 : 36;
  const warningLimit = snapshotType === 'hourly' ? 6 : 72;
  const status: AnalyticsHealthStatus =
    age <= healthyLimit ? 'healthy' : age <= warningLimit ? 'warning' : 'broken';

  return {
    snapshotType,
    status,
    latestBucketAt: latest.bucketAt,
    latestCapturedAt: latest.capturedAt,
    ageHours: roundedHours(age),
    message:
      status === 'healthy'
        ? `Latest ${snapshotType} snapshot is fresh.`
        : `Latest ${snapshotType} snapshot is ${roundedHours(age)} hours old.`
  };
}

export function getSnapshotHealth(
  options: { baseCurrency?: Currency; now?: Date } = {}
): SnapshotHealth {
  const settings = getAppSettings();
  const baseCurrency = options.baseCurrency ?? settings.baseCurrency;
  const now = options.now ?? new Date();
  const rows = snapshotRows(baseCurrency);
  const usableRows = rows.filter((row) => row.priceStatus !== 'failed');
  const last24h = new Date(now.getTime() - DAY_MS).toISOString();
  const recentRows = rows.filter((row) => row.capturedAt >= last24h);
  const hourly = latestSnapshotFreshness('hourly', usableRows, now);
  const daily = latestSnapshotFreshness('daily', usableRows, now);
  const latestSuccessfulSnapshotAt =
    usableRows.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]?.capturedAt ?? null;
  const failedSnapshotsLast24h = recentRows.filter((row) => row.priceStatus === 'failed').length;
  const staleSnapshotsLast24h = recentRows.filter((row) => row.priceStatus === 'stale').length;
  const priceStatusHealth: AnalyticsHealthStatus =
    failedSnapshotsLast24h > 0 ? 'warning' : staleSnapshotsLast24h > 0 ? 'warning' : 'healthy';

  return {
    status:
      usableRows.length === 0
        ? 'broken'
        : worstStatus([hourly.status, daily.status, priceStatusHealth]),
    hourly,
    daily,
    latestSuccessfulSnapshotAt,
    failedSnapshotsLast24h,
    staleSnapshotsLast24h
  };
}

function latestPriceSnapshotsByAsset(
  fiatCurrency: Currency,
  assetIds: string[]
): Map<string, PriceSnapshotRow> {
  if (assetIds.length === 0) return new Map();
  const rows = db
    .select()
    .from(priceSnapshots)
    .where(
      and(eq(priceSnapshots.fiatCurrency, fiatCurrency), inArray(priceSnapshots.assetId, assetIds))
    )
    .orderBy(desc(priceSnapshots.capturedAt))
    .all();
  const wanted = new Set(assetIds);
  const latest = new Map<string, PriceSnapshotRow>();

  for (const row of rows) {
    if (!wanted.has(row.assetId) || latest.has(row.assetId)) continue;
    latest.set(row.assetId, row);
  }

  return latest;
}

export async function getPriceHealth(
  options: {
    baseCurrency?: Currency;
    now?: Date;
    normalizedTransactions?: NormalizedTransactionRecord[];
  } = {}
): Promise<PriceHealth> {
  const settings = getAppSettings();
  const baseCurrency = options.baseCurrency ?? settings.baseCurrency;
  const now = options.now ?? new Date();
  const normalizedTransactions =
    options.normalizedTransactions ??
    (await normalizeTransactions(listTransactionsWithAssets(), baseCurrency));
  const preliminary = calculatePortfolio(normalizedTransactions, [], baseCurrency);
  const activeHoldings = preliminary.holdings.filter((holding) =>
    asDecimal(holding.quantity).gt(0)
  );
  const assetIds = activeHoldings.map((holding) => holding.assetId);
  const latestSnapshots = latestPriceSnapshotsByAsset(baseCurrency, assetIds);
  const latestEvents = listLatestPriceUpdateEvents(baseCurrency, assetIds);
  const latestSuccessfulEvent = getLatestSuccessfulPriceUpdateEvent(baseCurrency);
  const latestPriceAt =
    [...latestSnapshots.values()].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]
      ?.capturedAt ?? null;

  const assets: AssetPriceHealth[] = activeHoldings.map((holding) => {
    const snapshot = latestSnapshots.get(holding.assetId) ?? null;
    const event = latestEvents.get(holding.assetId) ?? null;
    const eventIsLatest =
      event &&
      (!snapshot || new Date(event.checkedAt).getTime() >= new Date(snapshot.capturedAt).getTime());

    if (eventIsLatest && event.status === 'failed') {
      return {
        assetId: holding.assetId,
        assetSymbol: holding.assetSymbol,
        assetName: holding.assetName,
        status: 'failed',
        latestPrice: snapshot?.price ?? null,
        latestPriceAt: snapshot?.capturedAt ?? null,
        latestEventStatus: event.status,
        latestEventAt: event.checkedAt,
        message: event.errorMessage ?? 'Latest price fetch failed.'
      };
    }

    if (!snapshot) {
      return {
        assetId: holding.assetId,
        assetSymbol: holding.assetSymbol,
        assetName: holding.assetName,
        status: 'missing',
        latestPrice: null,
        latestPriceAt: null,
        latestEventStatus: event?.status ?? null,
        latestEventAt: event?.checkedAt ?? null,
        message: 'No usable cached price exists.'
      };
    }

    const ageMs = now.getTime() - new Date(snapshot.capturedAt).getTime();
    if (ageMs <= PRICE_FRESH_MS) {
      return {
        assetId: holding.assetId,
        assetSymbol: holding.assetSymbol,
        assetName: holding.assetName,
        status: 'fresh',
        latestPrice: snapshot.price,
        latestPriceAt: snapshot.capturedAt,
        latestEventStatus: event?.status ?? null,
        latestEventAt: event?.checkedAt ?? null,
        message: 'Latest cached price is fresh.'
      };
    }

    if (ageMs <= PRICE_USABLE_MS) {
      return {
        assetId: holding.assetId,
        assetSymbol: holding.assetSymbol,
        assetName: holding.assetName,
        status: 'stale',
        latestPrice: snapshot.price,
        latestPriceAt: snapshot.capturedAt,
        latestEventStatus: event?.status ?? null,
        latestEventAt: event?.checkedAt ?? null,
        message:
          eventIsLatest && event.status === 'stale_fallback'
            ? (event.errorMessage ?? 'Using stale fallback price.')
            : 'Cached price is older than 30 minutes.'
      };
    }

    return {
      assetId: holding.assetId,
      assetSymbol: holding.assetSymbol,
      assetName: holding.assetName,
      status: 'missing',
      latestPrice: snapshot.price,
      latestPriceAt: snapshot.capturedAt,
      latestEventStatus: event?.status ?? null,
      latestEventAt: event?.checkedAt ?? null,
      message: 'Cached price is older than 24 hours.'
    };
  });

  const freshCount = assets.filter((asset) => asset.status === 'fresh').length;
  const staleCount = assets.filter((asset) => asset.status === 'stale').length;
  const missingCount = assets.filter((asset) => asset.status === 'missing').length;
  const failedCount = assets.filter((asset) => asset.status === 'failed').length;
  const status: AnalyticsHealthStatus =
    activeHoldings.length === 0
      ? 'healthy'
      : missingCount > 0 || failedCount === activeHoldings.length
        ? 'broken'
        : failedCount > 0 || staleCount > 0
          ? 'warning'
          : 'healthy';

  return {
    status,
    latestSuccessfulFetchAt: latestSuccessfulEvent?.checkedAt ?? latestPriceAt,
    latestPriceAt,
    freshCount,
    staleCount,
    missingCount,
    failedCount,
    assets
  };
}

function gapStatus(gaps: SnapshotGap[]): AnalyticsHealthStatus {
  if (gaps.some((gap) => (gap.snapshotType === 'hourly' ? gap.gapHours > 6 : gap.gapHours > 72))) {
    return 'broken';
  }
  return gaps.length > 0 ? 'warning' : 'healthy';
}

export async function getAnalyticsHealthSummary(
  options: {
    baseCurrency?: Currency;
    now?: Date;
    normalizedTransactions?: NormalizedTransactionRecord[];
    priceHealth?: PriceHealth;
  } = {}
): Promise<AnalyticsHealthSummary> {
  const checkedAt = (options.now ?? new Date()).toISOString();
  const snapshotHealth = getSnapshotHealth(options);
  const priceHealth = options.priceHealth ?? (await getPriceHealth(options));
  const gaps = getHistoryGaps(options);
  const status = worstStatus([snapshotHealth.status, priceHealth.status, gapStatus(gaps)]);
  const messages = [
    snapshotHealth.hourly.message,
    snapshotHealth.daily.message,
    ...priceHealth.assets
      .filter((asset) => asset.status !== 'fresh')
      .map((asset) => `${asset.assetSymbol}: ${asset.message}`),
    ...gaps.map(
      (gap) =>
        `${gap.snapshotType} snapshot gap from ${gap.gapStart} to ${gap.gapEnd} (${gap.gapHours}h).`
    )
  ];

  return {
    status,
    checkedAt,
    snapshotHealth,
    priceHealth,
    gaps,
    messages
  };
}
