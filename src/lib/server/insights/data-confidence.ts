import Decimal from 'decimal.js';
import type { AnalyticsHealthStatus } from '$lib/analytics/types';
import { calculatePortfolio } from '$lib/portfolio/calculations';
import { db } from '$lib/server/db/client';
import {
  portfolioSnapshots,
  priceSnapshots,
  priceUpdateEvents,
  transactions
} from '$lib/server/db/schema';
import {
  getHistoryGaps,
  getPriceHealth,
  getSnapshotHealth
} from '$lib/server/analytics/history-health';
import { getAppSettings } from '$lib/server/settings';
import { listTransactionsWithAssets } from '$lib/server/transactions';
import {
  assertNoNegativeHoldings,
  ensurePortfolioAccounting,
  listOpenLots
} from '$lib/server/portfolio/accounting';

type ConfidenceCategoryName = 'snapshots' | 'prices' | 'transactions' | 'accounting';

export type ConfidenceCategory = {
  score: number;
  status: AnalyticsHealthStatus;
  issues: string[];
};

export type DataConfidence = {
  score: number;
  status: AnalyticsHealthStatus;
  checkedAt: string;
  categories: Record<ConfidenceCategoryName, ConfidenceCategory>;
  issues: string[];
};

const WEIGHTS: Record<ConfidenceCategoryName, number> = {
  snapshots: 0.3,
  prices: 0.3,
  transactions: 0.25,
  accounting: 0.15
};

function asDecimal(value: string | null | undefined): Decimal {
  if (!value) return new Decimal(0);
  return new Decimal(value);
}

function safeDecimal(value: string | null | undefined): Decimal | null {
  try {
    const decimal = asDecimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function statusFromScore(score: number): AnalyticsHealthStatus {
  if (score >= 90) return 'healthy';
  if (score >= 55) return 'warning';
  return 'broken';
}

function category(score: number, issues: string[]): ConfidenceCategory {
  const normalized = clampScore(score);
  return {
    score: normalized,
    status:
      issues.length === 0 && normalized >= 85
        ? 'healthy'
        : normalized >= 90
          ? 'warning'
          : statusFromScore(normalized),
    issues
  };
}

function duplicateSnapshotIssues(): string[] {
  const buckets = new Map<string, number>();

  for (const snapshot of db.select().from(portfolioSnapshots).all()) {
    const key = `${snapshot.snapshotType}:${snapshot.baseCurrency}:${snapshot.bucketAt}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .filter(([, count]) => count > 1)
    .map(([bucket, count]) => `${count} duplicate snapshots found for ${bucket}.`);
}

function scoreSnapshots(now: Date): ConfidenceCategory {
  const settings = getAppSettings();
  const health = getSnapshotHealth({ baseCurrency: settings.baseCurrency, now });
  const gaps = getHistoryGaps({ baseCurrency: settings.baseCurrency });
  const duplicates = duplicateSnapshotIssues();
  const issues: string[] = [];
  let score = 100;

  if (health.hourly.status !== 'healthy') {
    issues.push(health.hourly.message);
    score -= health.hourly.status === 'broken' ? 35 : 15;
  }

  if (health.daily.status !== 'healthy') {
    issues.push(health.daily.message);
    score -= health.daily.status === 'broken' ? 25 : 10;
  }

  if (health.failedSnapshotsLast24h > 0) {
    issues.push(`${health.failedSnapshotsLast24h} failed snapshots in the last 24h.`);
    score -= 15;
  }

  if (health.staleSnapshotsLast24h > 0) {
    issues.push(`${health.staleSnapshotsLast24h} stale snapshots in the last 24h.`);
    score -= 8;
  }

  if (gaps.length > 0) {
    issues.push(`${gaps.length} large snapshot gap${gaps.length === 1 ? '' : 's'} detected.`);
    score -= Math.min(25, gaps.length * 5);
  }

  if (duplicates.length > 0) {
    issues.push(...duplicates);
    score -= Math.min(30, duplicates.length * 15);
  }

  return category(score, issues);
}

function repeatedFailedPriceIssues(now: Date): string[] {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const failed = db
    .select()
    .from(priceUpdateEvents)
    .all()
    .filter((event) => event.status === 'failed' && event.checkedAt >= since);

  if (failed.length >= 3) {
    return [`${failed.length} failed price update events in the last 24h.`];
  }

  return [];
}

async function scorePrices(now: Date): Promise<ConfidenceCategory> {
  const settings = getAppSettings();
  const health = await getPriceHealth({ baseCurrency: settings.baseCurrency, now });
  const issues = [
    ...health.assets
      .filter((asset) => asset.status !== 'fresh')
      .map((asset) => `${asset.assetSymbol}: ${asset.message}`),
    ...repeatedFailedPriceIssues(now)
  ];
  let score = 100;

  score -= health.missingCount * 25;
  score -= health.failedCount * 20;
  score -= health.staleCount * 10;
  if (health.assets.length > 0 && health.freshCount === 0) score -= 15;
  if (issues.some((issue) => issue.includes('failed price update'))) score -= 10;

  return category(score, issues);
}

function nearestPriceIssues(): string[] {
  const priceRows = db.select().from(priceSnapshots).all();
  const issues: string[] = [];

  for (const transaction of db.select().from(transactions).all()) {
    const quantity = safeDecimal(transaction.quantity);
    const fiat = safeDecimal(transaction.fiatAmount);
    if (!quantity || !fiat || quantity.lte(0) || fiat.lte(0)) continue;

    const transactionTime = new Date(transaction.transactionDate).getTime();
    const nearby = priceRows
      .filter(
        (price) =>
          price.assetId === transaction.assetId &&
          price.fiatCurrency === transaction.fiatCurrency &&
          Math.abs(new Date(price.capturedAt).getTime() - transactionTime) <=
            3 * 24 * 60 * 60 * 1000
      )
      .sort(
        (a, b) =>
          Math.abs(new Date(a.capturedAt).getTime() - transactionTime) -
          Math.abs(new Date(b.capturedAt).getTime() - transactionTime)
      )[0];

    if (!nearby) continue;

    const impliedPrice = fiat.div(quantity);
    const marketPrice = safeDecimal(nearby.price);
    if (!marketPrice || marketPrice.lte(0)) continue;

    const ratio = impliedPrice.div(marketPrice);
    if (ratio.gt(10) || ratio.lt(0.1)) {
      issues.push(
        `${transaction.assetSymbol} transaction on ${transaction.transactionDate.slice(
          0,
          10
        )} has a suspicious implied price.`
      );
    }
  }

  return issues;
}

function scoreTransactions(): ConfidenceCategory {
  const rows = db.select().from(transactions).all();
  const issues: string[] = [];
  let score = 100;

  const missingQuantity = rows.filter((row) => !safeDecimal(row.quantity)).length;
  const missingFiat = rows.filter((row) => !safeDecimal(row.fiatAmount)).length;
  const missingDate = rows.filter((row) => !row.transactionDate).length;
  const missingFees = rows.filter((row) => !row.feeAmount).length;

  if (missingQuantity > 0) {
    issues.push(
      `${missingQuantity} transaction${missingQuantity === 1 ? '' : 's'} missing quantity.`
    );
    score -= Math.min(40, missingQuantity * 15);
  }

  if (missingFiat > 0) {
    issues.push(`${missingFiat} transaction${missingFiat === 1 ? '' : 's'} missing fiat amount.`);
    score -= Math.min(40, missingFiat * 15);
  }

  if (missingDate > 0) {
    issues.push(`${missingDate} transaction${missingDate === 1 ? '' : 's'} missing date.`);
    score -= Math.min(40, missingDate * 15);
  }

  if (missingFees > 0 && rows.length > 0) {
    issues.push(`${missingFees} transaction${missingFees === 1 ? '' : 's'} have no fee entered.`);
    score -= Math.min(8, missingFees);
  }

  try {
    assertNoNegativeHoldings(
      rows.map((row) => ({
        id: row.id,
        assetId: row.assetId,
        assetSymbol: row.assetSymbol,
        type: row.type,
        quantity: row.quantity,
        transactionDate: row.transactionDate,
        createdAt: row.createdAt
      }))
    );
  } catch (error) {
    issues.push(error instanceof Error ? error.message : 'A sell exceeds recorded holdings.');
    score -= 45;
  }

  const suspicious = nearestPriceIssues();
  if (suspicious.length > 0) {
    issues.push(...suspicious);
    score -= Math.min(30, suspicious.length * 15);
  }

  return category(score, issues);
}

async function scoreAccounting(): Promise<ConfidenceCategory> {
  const settings = getAppSettings();
  const rows = listTransactionsWithAssets();
  const issues: string[] = [];
  let score = 100;

  if (rows.length === 0) return category(score, issues);

  try {
    assertNoNegativeHoldings(
      rows.map((row) => ({
        id: row.id,
        assetId: row.assetId,
        assetSymbol: row.assetSymbol,
        type: row.type,
        quantity: row.quantity,
        transactionDate: row.transactionDate,
        createdAt: row.createdAt
      }))
    );
    await ensurePortfolioAccounting();
  } catch (error) {
    issues.push(error instanceof Error ? error.message : 'Accounting rebuild failed.');
    return category(35, issues);
  }

  const calculated = calculatePortfolio(rows, [], settings.baseCurrency);
  const lots = listOpenLots();
  const lotQuantityByAsset = new Map<string, Decimal>();

  for (const lot of lots) {
    lotQuantityByAsset.set(
      lot.assetId,
      (lotQuantityByAsset.get(lot.assetId) ?? new Decimal(0)).plus(lot.remainingQuantity)
    );
  }

  for (const holding of calculated.holdings) {
    const expected = asDecimal(holding.quantity);
    if (expected.lte(0)) continue;
    const actual = lotQuantityByAsset.get(holding.assetId) ?? new Decimal(0);
    if (actual.minus(expected).abs().gt('0.00000001')) {
      issues.push(`${holding.assetSymbol} open lots do not match transaction-derived holdings.`);
      score -= 25;
    }
  }

  return category(score, issues);
}

function overallStatus(
  score: number,
  categories: Record<ConfidenceCategoryName, ConfidenceCategory>
) {
  if (Object.values(categories).some((item) => item.status === 'broken') && score < 75) {
    return 'broken';
  }
  return statusFromScore(score);
}

export async function getDataConfidence(options: { now?: Date } = {}): Promise<DataConfidence> {
  const now = options.now ?? new Date();
  const categories = {
    snapshots: scoreSnapshots(now),
    prices: await scorePrices(now),
    transactions: scoreTransactions(),
    accounting: await scoreAccounting()
  } satisfies Record<ConfidenceCategoryName, ConfidenceCategory>;
  const score = clampScore(
    (Object.entries(categories) as Array<[ConfidenceCategoryName, ConfidenceCategory]>).reduce(
      (total, [name, item]) => total + item.score * WEIGHTS[name],
      0
    )
  );

  return {
    score,
    status: overallStatus(score, categories),
    checkedAt: now.toISOString(),
    categories,
    issues: Object.values(categories).flatMap((item) => item.issues)
  };
}
