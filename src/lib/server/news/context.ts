import Decimal from 'decimal.js';
import { and, asc, eq } from 'drizzle-orm';
import { getAnalyticsAllocation, getAnalyticsSummary } from '$lib/server/analytics/service';
import { db, getSqlite } from '$lib/server/db/client';
import { assets, priceSnapshots, type AssetRow } from '$lib/server/db/schema';
import { getAppSettings } from '$lib/server/settings';
import type { NewsSentimentLabel } from './themes';

export const NEWS_CONTEXT_DISCLAIMER =
  'This is possible news context only and does not prove causation.';

export const NEWS_RANGES = ['24h', '7d', '30d'] as const;
export type NewsRange = (typeof NEWS_RANGES)[number];

export const NEWS_CONTEXT_LABELS = ['positive', 'neutral', 'negative', 'mixed', 'unknown'] as const;

export type NewsArticleSummary = {
  id: string;
  sourceId: string;
  source: string;
  url: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  themes: string[];
  sentimentLabel: NewsSentimentLabel;
  matchedAssets: Array<{
    assetId: string;
    symbol: string;
    name: string;
    confidence: number;
    matchType: string;
  }>;
};

export type NewsContextArticle = {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  themes: string[];
  sentimentLabel: NewsSentimentLabel;
};

export type NewsContextAsset = {
  assetId: string;
  symbol: string;
  name: string;
  priceChangePercent: number | null;
  themes: string[];
  contextSummary: string;
  articles: NewsContextArticle[];
};

export type PortfolioNewsContext = {
  range: NewsRange;
  disclaimer: string;
  portfolioMovement: {
    available: boolean;
    percentChange: number | null;
    message: string | null;
  };
  assets: NewsContextAsset[];
};

export type AssetNewsContext = {
  range: NewsRange;
  disclaimer: string;
  asset: NewsContextAsset | null;
  assets: NewsContextAsset[];
};

type ArticleRow = {
  id: string;
  sourceId: string;
  sourceName: string;
  url: string;
  title: string;
  summary: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  rawThemesJson: string | null;
  sentimentLabel: NewsSentimentLabel;
};

type MatchRow = {
  articleId: string;
  assetId: string;
  symbol: string;
  name: string;
  confidence: number;
  matchType: string;
};

type ArticleFilters = {
  assetId?: string | null;
  sourceId?: string | null;
  theme?: string | null;
  sentimentLabel?: NewsSentimentLabel | null;
  range?: NewsRange | null;
  limit?: number;
  now?: Date;
};

function rangeStart(range: NewsRange, now: Date): string {
  const start = new Date(now);
  if (range === '24h') start.setUTCHours(start.getUTCHours() - 24);
  if (range === '7d') start.setUTCDate(start.getUTCDate() - 7);
  if (range === '30d') start.setUTCDate(start.getUTCDate() - 30);
  return start.toISOString();
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function articleTime(article: NewsArticleSummary): string {
  return article.publishedAt ?? article.fetchedAt;
}

function toNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function themeList(themes: string[]): string {
  if (themes.length === 0) return '';
  if (themes.length === 1) return themes[0];
  if (themes.length === 2) return `${themes[0]} and ${themes[1]}`;
  return `${themes.slice(0, -1).join(', ')}, and ${themes.at(-1)}`;
}

function contextSummary(symbol: string, range: NewsRange, themes: string[], articleCount: number) {
  if (articleCount === 0) {
    return `No recent related headlines matched ${symbol} over ${range}.`;
  }

  if (themes.length === 0) {
    return `Recent related headlines matched ${symbol}, but no dominant theme was detected.`;
  }

  return `Recent related headlines mention ${themeList(themes)}.`;
}

function loadArticleRows(limit: number): ArticleRow[] {
  return getSqlite()
    .prepare(
      `
      SELECT
        a.id AS id,
        a.source_id AS sourceId,
        s.name AS sourceName,
        a.url AS url,
        a.title AS title,
        a.summary AS summary,
        a.published_at AS publishedAt,
        a.fetched_at AS fetchedAt,
        a.raw_themes_json AS rawThemesJson,
        a.sentiment_label AS sentimentLabel
      FROM news_articles a
      JOIN news_sources s ON s.id = a.source_id
      ORDER BY COALESCE(a.published_at, a.fetched_at) DESC
      LIMIT ?
    `
    )
    .all(limit) as ArticleRow[];
}

function loadMatchRows(articleIds: string[]): Map<string, MatchRow[]> {
  if (articleIds.length === 0) return new Map();

  const placeholders = articleIds.map(() => '?').join(', ');
  const rows = getSqlite()
    .prepare(
      `
      SELECT
        m.article_id AS articleId,
        m.asset_id AS assetId,
        a.symbol AS symbol,
        a.name AS name,
        m.confidence AS confidence,
        m.match_type AS matchType
      FROM news_article_asset_matches m
      JOIN assets a ON a.id = m.asset_id
      WHERE m.article_id IN (${placeholders})
      ORDER BY m.confidence DESC
    `
    )
    .all(...articleIds) as MatchRow[];
  const grouped = new Map<string, MatchRow[]>();

  for (const row of rows) {
    grouped.set(row.articleId, [...(grouped.get(row.articleId) ?? []), row]);
  }

  return grouped;
}

export function listNewsArticles(filters: ArticleFilters = {}): NewsArticleSummary[] {
  const limit = Math.max(1, Math.min(filters.limit ?? 100, 500));
  const rows = loadArticleRows(Math.max(limit * 4, 100));
  const matches = loadMatchRows(rows.map((row) => row.id));
  const start = filters.range ? rangeStart(filters.range, filters.now ?? new Date()) : null;

  return rows
    .map((row) => ({
      id: row.id,
      sourceId: row.sourceId,
      source: row.sourceName,
      url: row.url,
      title: row.title,
      summary: row.summary,
      publishedAt: row.publishedAt,
      fetchedAt: row.fetchedAt,
      themes: parseStringArray(row.rawThemesJson),
      sentimentLabel: row.sentimentLabel,
      matchedAssets: (matches.get(row.id) ?? []).map((match) => ({
        assetId: match.assetId,
        symbol: match.symbol,
        name: match.name,
        confidence: match.confidence,
        matchType: match.matchType
      }))
    }))
    .filter((article) => !filters.sourceId || article.sourceId === filters.sourceId)
    .filter((article) => !start || articleTime(article) >= start)
    .filter((article) => !filters.theme || article.themes.includes(filters.theme))
    .filter(
      (article) => !filters.sentimentLabel || article.sentimentLabel === filters.sentimentLabel
    )
    .filter(
      (article) =>
        !filters.assetId || article.matchedAssets.some((match) => match.assetId === filters.assetId)
    )
    .slice(0, limit);
}

export function getRecentMatchedArticles(
  assetId: string,
  range: NewsRange,
  options: { now?: Date; limit?: number } = {}
): NewsArticleSummary[] {
  return listNewsArticles({
    assetId,
    range,
    limit: options.limit ?? 50,
    now: options.now
  });
}

export function getNewsThemesByAsset(
  assetId: string,
  range: NewsRange,
  options: { now?: Date; limit?: number } = {}
): string[] {
  const articles = getRecentMatchedArticles(assetId, range, options);
  const scores = new Map<string, { count: number; latest: number }>();

  for (const article of articles) {
    const latest = new Date(articleTime(article)).getTime();
    for (const theme of article.themes) {
      const current = scores.get(theme) ?? { count: 0, latest: 0 };
      scores.set(theme, {
        count: current.count + 1,
        latest: Math.max(current.latest, Number.isNaN(latest) ? 0 : latest)
      });
    }
  }

  return [...scores.entries()]
    .sort(
      (a, b) => b[1].count - a[1].count || b[1].latest - a[1].latest || a[0].localeCompare(b[0])
    )
    .map(([theme]) => theme)
    .slice(0, options.limit ?? 5);
}

function getAsset(assetId: string): AssetRow | null {
  return db.select().from(assets).where(eq(assets.id, assetId)).get() ?? null;
}

function getAssetPriceChangePercent(
  assetId: string,
  range: NewsRange,
  options: { now?: Date } = {}
): number | null {
  const settings = getAppSettings();
  const now = options.now ?? new Date();
  const start = rangeStart(range, now);
  const rows = db
    .select()
    .from(priceSnapshots)
    .where(
      and(
        eq(priceSnapshots.assetId, assetId),
        eq(priceSnapshots.fiatCurrency, settings.baseCurrency)
      )
    )
    .orderBy(asc(priceSnapshots.capturedAt))
    .all();

  if (rows.length < 2) return null;

  const latest =
    [...rows].reverse().find((row) => row.capturedAt <= now.toISOString()) ?? rows.at(-1);
  const baseline =
    [...rows].reverse().find((row) => row.capturedAt <= start) ??
    rows.find((row) => row.capturedAt >= start);

  if (!latest || !baseline || latest.id === baseline.id) return null;

  const latestPrice = new Decimal(latest.price);
  const baselinePrice = new Decimal(baseline.price);
  if (!latestPrice.isFinite() || !baselinePrice.isFinite() || baselinePrice.lte(0)) return null;

  return Number(latestPrice.minus(baselinePrice).div(baselinePrice).mul(100).toDecimalPlaces(2));
}

function toContextArticle(article: NewsArticleSummary): NewsContextArticle {
  return {
    title: article.title,
    source: article.source,
    url: article.url,
    publishedAt: article.publishedAt,
    themes: article.themes,
    sentimentLabel: article.sentimentLabel
  };
}

export function getAssetNewsContext(
  assetId: string,
  range: NewsRange,
  options: { now?: Date } = {}
): AssetNewsContext {
  const asset = getAsset(assetId);
  if (!asset) {
    return {
      range,
      disclaimer: NEWS_CONTEXT_DISCLAIMER,
      asset: null,
      assets: []
    };
  }

  const articles = getRecentMatchedArticles(assetId, range, { now: options.now, limit: 20 });
  const themes = getNewsThemesByAsset(assetId, range, { now: options.now, limit: 5 });
  const result = {
    assetId: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    priceChangePercent: getAssetPriceChangePercent(asset.id, range, options),
    themes,
    contextSummary: contextSummary(asset.symbol, range, themes, articles.length),
    articles: articles.slice(0, 5).map(toContextArticle)
  };

  return {
    range,
    disclaimer: NEWS_CONTEXT_DISCLAIMER,
    asset: result,
    assets: [result]
  };
}

export async function getPortfolioNewsContext(
  range: NewsRange,
  options: { now?: Date } = {}
): Promise<PortfolioNewsContext> {
  const now = options.now ?? new Date();
  const [summary, allocation] = await Promise.all([
    getAnalyticsSummary({ now }),
    getAnalyticsAllocation()
  ]);
  const contexts = allocation.assets
    .map((asset) => getAssetNewsContext(asset.assetId, range, { now }).asset)
    .filter((asset): asset is NewsContextAsset => asset !== null)
    .sort(
      (a, b) =>
        Math.abs(b.priceChangePercent ?? 0) - Math.abs(a.priceChangePercent ?? 0) ||
        b.articles.length - a.articles.length
    )
    .slice(0, 6);
  const movement = summary.changes[range];

  return {
    range,
    disclaimer: NEWS_CONTEXT_DISCLAIMER,
    portfolioMovement: {
      available: movement.available,
      percentChange: toNumber(movement.percentChange),
      message: movement.message ?? null
    },
    assets: contexts
  };
}
