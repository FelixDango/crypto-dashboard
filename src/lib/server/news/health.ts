import { desc, eq } from 'drizzle-orm';
import type { AnalyticsHealthStatus } from '$lib/analytics/types';
import { db, getSqlite } from '$lib/server/db/client';
import { newsFetchEvents, newsSources } from '$lib/server/db/schema';

export type NewsSourceHealth = {
  id: string;
  name: string;
  type: string;
  url: string;
  isEnabled: boolean;
  fetchIntervalMinutes: number;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  status: AnalyticsHealthStatus | 'pending' | 'disabled';
};

export type NewsHealth = {
  status: AnalyticsHealthStatus;
  checkedAt: string;
  latestSuccessfulFetchAt: string | null;
  enabledSources: number;
  pendingSources: number;
  failedSources: number;
  articlesFetchedLast24h: number;
  matchedArticlesLast24h: number;
  stale: boolean;
  messages: string[];
  sources: NewsSourceHealth[];
};

const HOUR_MS = 60 * 60 * 1000;

function ageHours(value: string, now: Date): number {
  return (now.getTime() - new Date(value).getTime()) / HOUR_MS;
}

function sourceStatus(
  source: {
    isEnabled: boolean;
    lastFetchedAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
  },
  now: Date
): NewsSourceHealth['status'] {
  if (!source.isEnabled) return 'disabled';
  if (!source.lastFetchedAt && !source.lastSuccessAt && !source.lastError) return 'pending';
  if (!source.lastSuccessAt) return 'broken';

  const age = ageHours(source.lastSuccessAt, now);
  if (age > 72) return 'broken';
  if (age > 24 || source.lastError) return 'warning';
  return 'healthy';
}

function latestSuccessfulFetchAt(): string | null {
  return (
    db
      .select()
      .from(newsFetchEvents)
      .where(eq(newsFetchEvents.status, 'success'))
      .orderBy(desc(newsFetchEvents.finishedAt))
      .limit(1)
      .get()?.finishedAt ?? null
  );
}

function countArticlesFetchedSince(since: string): number {
  return (
    (
      getSqlite()
        .prepare('SELECT COUNT(*) AS count FROM news_articles WHERE fetched_at >= ?')
        .get(since) as { count: number }
    ).count ?? 0
  );
}

function countMatchedArticlesSince(since: string): number {
  return (
    (
      getSqlite()
        .prepare(
          `
        SELECT COUNT(DISTINCT a.id) AS count
        FROM news_articles a
        JOIN news_article_asset_matches m ON m.article_id = a.id
        WHERE COALESCE(a.published_at, a.fetched_at) >= ?
      `
        )
        .get(since) as { count: number }
    ).count ?? 0
  );
}

export function getNewsHealth(options: { now?: Date } = {}): NewsHealth {
  const now = options.now ?? new Date();
  const checkedAt = now.toISOString();
  const since24h = new Date(now.getTime() - 24 * HOUR_MS).toISOString();
  const sources = db
    .select()
    .from(newsSources)
    .orderBy(newsSources.name)
    .all()
    .map((source) => ({
      id: source.id,
      name: source.name,
      type: source.type,
      url: source.url,
      isEnabled: source.isEnabled,
      fetchIntervalMinutes: source.fetchIntervalMinutes,
      lastFetchedAt: source.lastFetchedAt,
      lastSuccessAt: source.lastSuccessAt,
      lastError: source.lastError,
      status: sourceStatus(source, now)
    }));
  const enabled = sources.filter((source) => source.isEnabled);
  const pendingSources = enabled.filter((source) => source.status === 'pending').length;
  const failedSources = enabled.filter((source) => source.status === 'broken').length;
  const warningSources = enabled.filter((source) => source.status === 'warning').length;
  const attemptedSources = enabled.length - pendingSources;
  const latestSuccess = latestSuccessfulFetchAt();
  const latestSuccessAge = latestSuccess ? ageHours(latestSuccess, now) : null;
  const articlesFetchedLast24h = countArticlesFetchedSince(since24h);
  const matchedArticlesLast24h = countMatchedArticlesSince(since24h);
  const messages: string[] = [];

  if (enabled.length === 0) messages.push('No enabled news sources.');
  if (!latestSuccess && attemptedSources === 0) {
    messages.push('News fetch has not run yet.');
  } else if (!latestSuccess) {
    messages.push('No successful news fetch has completed yet.');
  }
  if (pendingSources > 0) {
    messages.push(
      `${pendingSources} enabled news source${pendingSources === 1 ? '' : 's'} waiting for first fetch.`
    );
  }
  if (latestSuccessAge !== null && latestSuccessAge > 24) {
    messages.push(`Latest successful news fetch is ${Math.round(latestSuccessAge)} hours old.`);
  }
  if (failedSources > 0) {
    messages.push(`${failedSources} enabled news source${failedSources === 1 ? '' : 's'} broken.`);
  }
  if (warningSources > 0) {
    messages.push(
      `${warningSources} enabled news source${warningSources === 1 ? '' : 's'} warning.`
    );
  }
  if (articlesFetchedLast24h > 0 && matchedArticlesLast24h === 0) {
    messages.push('News feeds are fetching, but no recent articles matched held assets.');
  }

  let status: AnalyticsHealthStatus = 'healthy';
  if (
    enabled.length === 0 ||
    (!latestSuccess && attemptedSources > 0) ||
    (latestSuccessAge !== null && latestSuccessAge > 72) ||
    (enabled.length > 0 && failedSources === enabled.length)
  ) {
    status = 'broken';
  } else if (
    (!latestSuccess && attemptedSources === 0) ||
    pendingSources > 0 ||
    (latestSuccessAge !== null && latestSuccessAge > 24) ||
    failedSources > 0 ||
    warningSources > 0 ||
    (articlesFetchedLast24h > 0 && matchedArticlesLast24h === 0)
  ) {
    status = 'warning';
  }

  return {
    status,
    checkedAt,
    latestSuccessfulFetchAt: latestSuccess,
    enabledSources: enabled.length,
    pendingSources,
    failedSources,
    articlesFetchedLast24h,
    matchedArticlesLast24h,
    stale: latestSuccessAge === null || latestSuccessAge > 24,
    messages,
    sources
  };
}
