import Decimal from 'decimal.js';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AssetRecord, Currency } from '$lib/types';
import type { DailyMarketPoint, MarketSentiment } from '$lib/market-signals/types';
import type { ProviderDailyMarketPoint } from '$lib/server/prices/provider';
import { db, getSqlite } from '$lib/server/db/client';
import { marketSentimentSnapshots, marketSignalRefreshState } from '$lib/server/db/schema';
import { getPriceProvider } from '$lib/server/prices/providers';
import { getSavedPortfolioPlan } from '$lib/server/planning/service';
import { getAppSettings } from '$lib/server/settings';
import { UserInputError } from '$lib/server/errors';
import { fetchFearAndGreed } from './alternative';

const HISTORY_DAYS = 400;
const HISTORY_STALE_MS = 36 * 60 * 60 * 1_000;
const SENTIMENT_STALE_MS = 48 * 60 * 60 * 1_000;
const FAILED_RETRY_MS = 30 * 60 * 1_000;
let refreshQueue: Promise<void> = Promise.resolve();
type MarketHistoryAsset = Pick<AssetRecord, 'id' | 'provider' | 'providerCoinId'>;

function serializeRefresh<T>(task: () => Promise<T>): Promise<T> {
  const result = refreshQueue.then(task, task);
  refreshQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function dateIsWithin(value: string | null, maximumAgeMs: number, now: Date): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && now.getTime() - timestamp <= maximumAgeMs;
}

export function sentimentIsFresh(sentiment: MarketSentiment | null, now = new Date()): boolean {
  if (!sentiment || !dateIsWithin(sentiment.capturedAt, SENTIMENT_STALE_MS, now)) return false;
  const sourceAt = Date.parse(`${sentiment.observedOn}T23:59:59.999Z`);
  return Number.isFinite(sourceAt) && now.getTime() - sourceAt <= SENTIMENT_STALE_MS;
}

export function historyIsFresh(
  latestDay: string | null,
  lastSuccessAt: string | null,
  now = new Date()
): boolean {
  if (!dateIsWithin(lastSuccessAt, HISTORY_STALE_MS, now) || !latestDay) return false;
  const sourceAt = Date.parse(`${latestDay}T23:59:59.999Z`);
  return Number.isFinite(sourceAt) && now.getTime() - sourceAt <= HISTORY_STALE_MS;
}

export function getLatestMarketSentiment(): MarketSentiment | null {
  const row = db
    .select()
    .from(marketSentimentSnapshots)
    .where(eq(marketSentimentSnapshots.provider, 'alternative.me'))
    .orderBy(desc(marketSentimentSnapshots.observedOn), desc(marketSentimentSnapshots.capturedAt))
    .limit(1)
    .get();
  if (!row) return null;
  return { ...row, provider: 'alternative.me' };
}

export function normalizeDailyMarketHistory(
  points: ProviderDailyMarketPoint[],
  now = new Date()
): Array<Omit<DailyMarketPoint, 'assetId' | 'baseCurrency' | 'source' | 'capturedAt'>> {
  const today = now.toISOString().slice(0, 10);
  const byDay = new Map<
    string,
    { day: string; close: string; volume: string | null; timestamp: number }
  >();

  for (const point of points) {
    const timestamp = Date.parse(point.timestamp);
    if (!Number.isFinite(timestamp)) continue;
    const day = new Date(timestamp).toISOString().slice(0, 10);
    if (day >= today) continue;

    try {
      const close = new Decimal(point.close);
      const volume = point.volume === null ? null : new Decimal(point.volume);
      if (!close.isFinite() || close.lte(0) || (volume && (!volume.isFinite() || volume.lt(0)))) {
        continue;
      }
      const existing = byDay.get(day);
      if (!existing || timestamp > existing.timestamp) {
        byDay.set(day, {
          day,
          close: close.toString(),
          volume: volume?.toString() ?? null,
          timestamp
        });
      }
    } catch {
      // Invalid provider decimals are omitted; an entirely invalid payload fails below.
    }
  }

  return [...byDay.values()]
    .sort((left, right) => left.day.localeCompare(right.day))
    .slice(-HISTORY_DAYS)
    .map(({ day, close, volume }) => ({ day, close, volume }));
}

function setRefreshAttempt(assetId: string, currency: Currency, now: string): void {
  db.insert(marketSignalRefreshState)
    .values({
      id: `${assetId}:${currency}`,
      assetId,
      baseCurrency: currency,
      lastAttemptAt: now,
      lastSuccessAt: null,
      lastError: null,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: marketSignalRefreshState.id,
      set: { lastAttemptAt: now, lastError: null, updatedAt: now }
    })
    .run();
}

function setRefreshFailure(assetId: string, currency: Currency, now: string, error: unknown): void {
  const message = (error instanceof Error ? error.message : 'Market history refresh failed.').slice(
    0,
    500
  );
  db.update(marketSignalRefreshState)
    .set({ lastError: message, updatedAt: now })
    .where(
      and(
        eq(marketSignalRefreshState.assetId, assetId),
        eq(marketSignalRefreshState.baseCurrency, currency)
      )
    )
    .run();
}

function persistHistory(
  asset: MarketHistoryAsset,
  currency: Currency,
  source: string,
  points: ReturnType<typeof normalizeDailyMarketHistory>,
  now: string
): void {
  const cutoff = new Date(`${now.slice(0, 10)}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - HISTORY_DAYS);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  const sqlite = getSqlite();
  const upsert = sqlite.prepare(`
    INSERT INTO market_daily_points
      (id, asset_id, base_currency, day, close, volume, source, captured_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_id, base_currency, day, source) DO UPDATE SET
      close = excluded.close,
      volume = excluded.volume,
      captured_at = excluded.captured_at
  `);
  const prune = sqlite.prepare(`
    DELETE FROM market_daily_points
    WHERE asset_id = ? AND base_currency = ? AND source = ? AND day < ?
  `);
  const success = sqlite.prepare(`
    UPDATE market_signal_refresh_state
    SET last_success_at = ?, last_error = NULL, updated_at = ?
    WHERE asset_id = ? AND base_currency = ?
  `);

  sqlite.transaction(() => {
    for (const point of points) {
      upsert.run(
        `${source}:${asset.id}:${currency}:${point.day}`,
        asset.id,
        currency,
        point.day,
        point.close,
        point.volume,
        source,
        now
      );
    }
    prune.run(asset.id, currency, source, cutoffDay);
    success.run(now, now, asset.id, currency);
  })();
}

export async function refreshAssetMarketHistory(
  asset: MarketHistoryAsset,
  currency: Currency,
  now = new Date()
): Promise<{ assetId: string; points: number; latestDay: string }> {
  return serializeRefresh(async () => {
    const attemptedAt = now.toISOString();
    setRefreshAttempt(asset.id, currency, attemptedAt);
    try {
      const provider = getPriceProvider(asset.provider);
      const normalized = normalizeDailyMarketHistory(
        await provider.getDailyMarketHistory(asset.providerCoinId, currency, HISTORY_DAYS),
        now
      );
      if (normalized.length === 0) {
        throw new Error('The market-history provider returned no completed daily points.');
      }
      persistHistory(asset, currency, provider.id, normalized, attemptedAt);
      return {
        assetId: asset.id,
        points: normalized.length,
        latestDay: normalized.at(-1)!.day
      };
    } catch (error) {
      setRefreshFailure(asset.id, currency, attemptedAt, error);
      throw error;
    }
  });
}

export async function refreshMarketSentiment(now = new Date()): Promise<MarketSentiment> {
  const sentiment = await fetchFearAndGreed(now);
  db.insert(marketSentimentSnapshots)
    .values({ id: `${sentiment.provider}:${sentiment.observedOn}`, ...sentiment })
    .onConflictDoUpdate({
      target: marketSentimentSnapshots.id,
      set: {
        value: sentiment.value,
        classification: sentiment.classification,
        sourceUrl: sentiment.sourceUrl,
        capturedAt: sentiment.capturedAt
      }
    })
    .run();
  return sentiment;
}

export type MarketSignalRefreshSummary = {
  requested: number;
  refreshed: number;
  failed: number;
  sentiment: 'fresh' | 'refreshed' | 'failed';
  results: Array<{
    assetId: string;
    symbol: string;
    status: 'refreshed' | 'failed';
    error?: string;
  }>;
};

async function refreshSentimentIfDue(now: Date): Promise<MarketSignalRefreshSummary['sentiment']> {
  if (sentimentIsFresh(getLatestMarketSentiment(), now)) return 'fresh';
  try {
    await refreshMarketSentiment(now);
    return 'refreshed';
  } catch {
    return 'failed';
  }
}

export async function refreshPlannedMarketSignals(
  options: { limit?: number; now?: Date } = {}
): Promise<MarketSignalRefreshSummary> {
  const now = options.now ?? new Date();
  const limit = Math.max(0, Math.min(options.limit ?? 2, 2));
  const plan = getSavedPortfolioPlan();
  const currency = getAppSettings().baseCurrency;
  const sentiment = await refreshSentimentIfDue(now);
  if (!plan || limit === 0) {
    return { requested: 0, refreshed: 0, failed: 0, sentiment, results: [] };
  }

  const targetIds = plan.targets.map((target) => target.id);
  const states = targetIds.length
    ? db
        .select()
        .from(marketSignalRefreshState)
        .where(
          and(
            eq(marketSignalRefreshState.baseCurrency, currency),
            inArray(marketSignalRefreshState.assetId, targetIds)
          )
        )
        .all()
    : [];
  const stateByAsset = new Map(states.map((state) => [state.assetId, state]));
  const due = plan.targets
    .filter((target) => {
      const state = stateByAsset.get(target.id);
      if (!state) return true;
      if (state.lastError) return !dateIsWithin(state.lastAttemptAt, FAILED_RETRY_MS, now);
      return !dateIsWithin(state.lastSuccessAt, HISTORY_STALE_MS, now);
    })
    .sort((left, right) => {
      const leftState = stateByAsset.get(left.id);
      const rightState = stateByAsset.get(right.id);
      return (leftState?.lastSuccessAt ?? '').localeCompare(rightState?.lastSuccessAt ?? '');
    })
    .slice(0, limit);

  const results: MarketSignalRefreshSummary['results'] = [];
  for (const target of due) {
    try {
      await refreshAssetMarketHistory(target, currency, now);
      results.push({ assetId: target.id, symbol: target.symbol, status: 'refreshed' });
    } catch (error) {
      results.push({
        assetId: target.id,
        symbol: target.symbol,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Refresh failed.'
      });
    }
  }

  return {
    requested: due.length,
    refreshed: results.filter((item) => item.status === 'refreshed').length,
    failed: results.filter((item) => item.status === 'failed').length,
    sentiment,
    results
  };
}

export async function refreshPlannedAssetMarketSignals(
  assetId: string,
  now = new Date()
): Promise<{ sentiment: 'fresh' | 'refreshed' | 'failed' }> {
  const plan = getSavedPortfolioPlan();
  const target = plan?.targets.find((item) => item.id === assetId);
  if (!target)
    throw new UserInputError('Only an asset in the saved allocation plan can be refreshed.');
  await refreshAssetMarketHistory(target, getAppSettings().baseCurrency, now);
  const sentiment = await refreshSentimentIfDue(now);
  return { sentiment };
}
