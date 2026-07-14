import { getSqlite } from '$lib/server/db/client';
import {
  getPortfolioNewsContext,
  listNewsArticles,
  newsArticleTime,
  type NewsArticleSort,
  type NewsArticleSummary,
  type NewsRange,
  type PortfolioNewsContext
} from './context';
import { getNewsHealth, type NewsHealth, type NewsSourceHealth } from './health';
import type { NewsSentimentLabel } from './themes';

export type NewsDashboardFilters = {
  range: NewsRange;
  assetId: string;
  sourceId: string;
  theme: string;
  sentimentLabel: NewsSentimentLabel | null;
  q: string;
  matchedOnly: boolean;
  sort: NewsArticleSort;
};

export type NewsDashboardStats = {
  totalArticles: number;
  matchedArticles: number;
  unmatchedArticles: number;
  activeSources: number;
  sourceIssueCount: number;
  latestArticleAt: string | null;
  fetchHasRun: boolean;
};

export type NewsThemeBucket = {
  theme: string;
  articles: number;
  matchedArticles: number;
  latestAt: string | null;
};

export type NewsSourceSummary = NewsSourceHealth & {
  articlesInRange: number;
  matchedArticlesInRange: number;
  latestArticleAt: string | null;
};

export type NewsFetchEventSummary = {
  id: string;
  sourceId: string | null;
  sourceName: string | null;
  status: 'success' | 'partial' | 'failed';
  articlesFound: number;
  articlesInserted: number;
  articlesUpdated: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
};

export type NewsDashboardData = {
  filters: NewsDashboardFilters;
  health: NewsHealth;
  context: PortfolioNewsContext;
  stats: NewsDashboardStats;
  themes: NewsThemeBucket[];
  sources: NewsSourceSummary[];
  fetchEvents: NewsFetchEventSummary[];
  articles: NewsArticleSummary[];
  fallbackArticles: NewsArticleSummary[];
};

function latestArticleAt(articles: NewsArticleSummary[]): string | null {
  let latest: { value: string; time: number } | null = null;

  for (const article of articles) {
    const value = newsArticleTime(article);
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) continue;
    if (!latest || time > latest.time) latest = { value, time };
  }

  return latest?.value ?? null;
}

function buildThemeBuckets(articles: NewsArticleSummary[]): NewsThemeBucket[] {
  const buckets = new Map<string, NewsThemeBucket>();

  for (const article of articles) {
    for (const theme of article.themes) {
      const current =
        buckets.get(theme) ??
        ({
          theme,
          articles: 0,
          matchedArticles: 0,
          latestAt: null
        } satisfies NewsThemeBucket);
      current.articles += 1;
      if (article.matchedAssets.length > 0) current.matchedArticles += 1;
      const articleAt = newsArticleTime(article);
      if (
        !current.latestAt ||
        new Date(articleAt).getTime() > new Date(current.latestAt).getTime()
      ) {
        current.latestAt = articleAt;
      }

      buckets.set(theme, current);
    }
  }

  return [...buckets.values()]
    .sort(
      (a, b) =>
        b.matchedArticles - a.matchedArticles ||
        b.articles - a.articles ||
        new Date(b.latestAt ?? 0).getTime() - new Date(a.latestAt ?? 0).getTime() ||
        a.theme.localeCompare(b.theme)
    )
    .slice(0, 12);
}

function buildSourceSummaries(
  sources: NewsSourceHealth[],
  articles: NewsArticleSummary[]
): NewsSourceSummary[] {
  return sources.map((source) => {
    const sourceArticles = articles.filter((article) => article.sourceId === source.id);

    return {
      ...source,
      articlesInRange: sourceArticles.length,
      matchedArticlesInRange: sourceArticles.filter((article) => article.matchedAssets.length > 0)
        .length,
      latestArticleAt: latestArticleAt(sourceArticles)
    };
  });
}

function listRecentFetchEvents(limit = 8): NewsFetchEventSummary[] {
  return getSqlite()
    .prepare(
      `
      SELECT
        e.id AS id,
        e.source_id AS sourceId,
        s.name AS sourceName,
        e.status AS status,
        e.articles_found AS articlesFound,
        e.articles_inserted AS articlesInserted,
        e.articles_updated AS articlesUpdated,
        e.error_message AS errorMessage,
        e.started_at AS startedAt,
        e.finished_at AS finishedAt,
        e.created_at AS createdAt
      FROM news_fetch_events e
      LEFT JOIN news_sources s ON s.id = e.source_id
      ORDER BY e.created_at DESC
      LIMIT ?
    `
    )
    .all(limit) as NewsFetchEventSummary[];
}

export async function getNewsDashboardData(
  filters: NewsDashboardFilters
): Promise<NewsDashboardData> {
  const health = getNewsHealth();
  const [context, rangeArticles] = await Promise.all([
    getPortfolioNewsContext(filters.range),
    Promise.resolve(listNewsArticles({ range: filters.range, limit: 500 }))
  ]);
  const articles = listNewsArticles({
    assetId: filters.assetId || null,
    sourceId: filters.sourceId || null,
    theme: filters.theme || null,
    sentimentLabel: filters.sentimentLabel,
    q: filters.q || null,
    matchedOnly: filters.matchedOnly,
    sort: filters.sort,
    range: filters.range,
    limit: 150
  });
  const matchedArticles = rangeArticles.filter((article) => article.matchedAssets.length > 0);
  const fetchHasRun = health.sources.some((source) => Boolean(source.lastFetchedAt));

  return {
    filters,
    health,
    context,
    stats: {
      totalArticles: rangeArticles.length,
      matchedArticles: matchedArticles.length,
      unmatchedArticles: rangeArticles.length - matchedArticles.length,
      activeSources: health.enabledSources,
      sourceIssueCount: health.sources.filter(
        (source) => source.isEnabled && source.status !== 'healthy'
      ).length,
      latestArticleAt: latestArticleAt(rangeArticles),
      fetchHasRun
    },
    themes: buildThemeBuckets(rangeArticles),
    sources: buildSourceSummaries(health.sources, rangeArticles),
    fetchEvents: listRecentFetchEvents(),
    articles,
    fallbackArticles:
      articles.length === 0
        ? listNewsArticles({ range: filters.range, sort: 'latest', limit: 8 })
        : []
  };
}
