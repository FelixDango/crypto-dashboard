import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db, getSqlite } from '$lib/server/db/client';
import { newsFetchEvents, newsSources, type NewsSourceRow } from '$lib/server/db/schema';
import { classifyContextLabel, extractThemes } from './themes';
import { listHeldAssetsForMatching, matchArticleToAssets, type NewsAssetMatch } from './matching';
import type { FetchedArticle, NewsProvider } from './provider';
import { normalizeArticleUrl } from './provider';
import { RssNewsProvider } from './rss';

export type NewsFetchSourceResult = {
  sourceId: string;
  sourceName: string;
  status: 'success' | 'partial' | 'failed';
  articlesFound: number;
  articlesInserted: number;
  articlesUpdated: number;
  matchesCreated: number;
  errorMessage: string | null;
};

export type NewsFetchSummary = {
  status: 'ok';
  sourcesChecked: number;
  articlesFound: number;
  articlesInserted: number;
  articlesUpdated: number;
  matchesCreated: number;
  failures: number;
  cleanup: {
    successDeleted: number;
    issueDeleted: number;
  };
  sources: NewsFetchSourceResult[];
};

type FetchOptions = {
  provider?: NewsProvider;
  now?: Date;
  onlyDue?: boolean;
};

type StoredArticle = {
  id: string;
  inserted: boolean;
  updated: boolean;
};

type ExistingArticle = {
  id: string;
};

const MAX_ERROR_LENGTH = 1000;

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR_LENGTH);
}

function sourceIsDue(source: NewsSourceRow, now: Date): boolean {
  if (!source.isEnabled) return false;
  if (!source.lastFetchedAt) return true;

  const lastFetched = new Date(source.lastFetchedAt).getTime();
  if (Number.isNaN(lastFetched)) return true;

  const intervalMs = Math.max(5, source.fetchIntervalMinutes) * 60 * 1000;
  return now.getTime() - lastFetched >= intervalMs;
}

export function listNewsSources(includeDisabled = true): NewsSourceRow[] {
  const rows = db.select().from(newsSources).orderBy(asc(newsSources.name)).all();
  return includeDisabled ? rows : rows.filter((source) => source.isEnabled);
}

export function listDueNewsSources(now = new Date()): NewsSourceRow[] {
  return listNewsSources(false).filter((source) => sourceIsDue(source, now));
}

function findExistingArticle(
  sourceId: string,
  externalId: string | null,
  url: string
): ExistingArticle | null {
  const sqlite = getSqlite();

  if (externalId) {
    const byExternal = sqlite
      .prepare('SELECT id FROM news_articles WHERE source_id = ? AND external_id = ? LIMIT 1')
      .get(sourceId, externalId) as ExistingArticle | undefined;
    if (byExternal) return byExternal;
  }

  return (
    (sqlite.prepare('SELECT id FROM news_articles WHERE url = ? LIMIT 1').get(url) as
      ExistingArticle | undefined) ?? null
  );
}

function upsertArticle(input: {
  sourceId: string;
  article: FetchedArticle;
  themes: string[];
  matches: NewsAssetMatch[];
  sentimentLabel: string;
  fetchedAt: string;
  now: string;
}): StoredArticle {
  const sqlite = getSqlite();
  const url = normalizeArticleUrl(input.article.url);
  const externalId = input.article.externalId?.trim() || null;
  const summary = input.article.summary?.trim() || null;
  const publishedAt = input.article.publishedAt?.toISOString() ?? null;
  const rawAssetMentionsJson = input.matches.length > 0 ? JSON.stringify(input.matches) : null;
  const rawThemesJson = input.themes.length > 0 ? JSON.stringify(input.themes) : null;
  const existing = findExistingArticle(input.sourceId, externalId, url);

  if (existing) {
    sqlite
      .prepare(
        `
        UPDATE news_articles
        SET
          source_id = ?,
          external_id = ?,
          url = ?,
          canonical_url = ?,
          title = ?,
          summary = ?,
          published_at = ?,
          fetched_at = ?,
          language = ?,
          raw_asset_mentions_json = ?,
          raw_themes_json = ?,
          sentiment_label = ?,
          updated_at = ?
        WHERE id = ?
      `
      )
      .run(
        input.sourceId,
        externalId,
        url,
        url,
        input.article.title.trim(),
        summary,
        publishedAt,
        input.fetchedAt,
        input.article.language ?? null,
        rawAssetMentionsJson,
        rawThemesJson,
        input.sentimentLabel,
        input.now,
        existing.id
      );

    return { id: existing.id, inserted: false, updated: true };
  }

  const id = randomUUID();
  sqlite
    .prepare(
      `
      INSERT INTO news_articles (
        id,
        source_id,
        external_id,
        url,
        canonical_url,
        title,
        summary,
        published_at,
        fetched_at,
        language,
        raw_asset_mentions_json,
        raw_themes_json,
        sentiment_label,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      id,
      input.sourceId,
      externalId,
      url,
      url,
      input.article.title.trim(),
      summary,
      publishedAt,
      input.fetchedAt,
      input.article.language ?? null,
      rawAssetMentionsJson,
      rawThemesJson,
      input.sentimentLabel,
      input.now,
      input.now
    );

  return { id, inserted: true, updated: false };
}

function refreshArticleMatches(articleId: string, matches: NewsAssetMatch[], now: string): number {
  const sqlite = getSqlite();
  sqlite.prepare('DELETE FROM news_article_asset_matches WHERE article_id = ?').run(articleId);

  const insert = sqlite.prepare(`
    INSERT INTO news_article_asset_matches (
      id,
      article_id,
      asset_id,
      match_type,
      confidence,
      matched_terms_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const match of matches) {
    insert.run(
      randomUUID(),
      articleId,
      match.assetId,
      match.matchType,
      match.confidence,
      JSON.stringify(match.matchedTerms),
      now
    );
  }

  return matches.length;
}

function recordFetchEvent(input: {
  sourceId: string;
  status: NewsFetchSourceResult['status'];
  articlesFound: number;
  articlesInserted: number;
  articlesUpdated: number;
  errorMessage?: string | null;
  startedAt: string;
  finishedAt: string;
}) {
  db.insert(newsFetchEvents)
    .values({
      id: randomUUID(),
      sourceId: input.sourceId,
      status: input.status,
      articlesFound: input.articlesFound,
      articlesInserted: input.articlesInserted,
      articlesUpdated: input.articlesUpdated,
      errorMessage: input.errorMessage ?? null,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      createdAt: input.finishedAt
    })
    .run();
}

function updateSourceAfterFetch(
  sourceId: string,
  input: { fetchedAt: string; successAt?: string | null; error?: string | null }
) {
  db.update(newsSources)
    .set({
      lastFetchedAt: input.fetchedAt,
      lastSuccessAt: input.successAt ?? null,
      lastError: input.error ?? null,
      updatedAt: input.fetchedAt
    })
    .where(eq(newsSources.id, sourceId))
    .run();
}

async function ingestSource(
  source: NewsSourceRow,
  provider: NewsProvider,
  now: Date
): Promise<NewsFetchSourceResult> {
  const startedAt = now.toISOString();
  const heldAssets = listHeldAssetsForMatching();

  try {
    const fetched = await provider.fetchSource(source);
    let articlesInserted = 0;
    let articlesUpdated = 0;
    let matchesCreated = 0;
    let articleErrors = 0;

    for (const article of fetched) {
      try {
        const url = normalizeArticleUrl(article.url);
        const title = article.title.trim();
        if (!url || !title) continue;

        const text = `${title} ${article.summary ?? ''}`;
        const themes = extractThemes(text);
        const sentimentLabel = classifyContextLabel(text);
        const matches = matchArticleToAssets({ title, summary: article.summary }, heldAssets);
        const fetchedAt = new Date().toISOString();
        const stored = upsertArticle({
          sourceId: source.id,
          article: { ...article, url, title },
          themes,
          matches,
          sentimentLabel,
          fetchedAt,
          now: fetchedAt
        });

        if (stored.inserted) articlesInserted += 1;
        if (stored.updated) articlesUpdated += 1;
        matchesCreated += refreshArticleMatches(stored.id, matches, fetchedAt);
      } catch {
        articleErrors += 1;
      }
    }

    const finishedAt = new Date().toISOString();
    const status: NewsFetchSourceResult['status'] = articleErrors > 0 ? 'partial' : 'success';
    const errorMessage =
      articleErrors > 0 ? `${articleErrors} article(s) could not be processed.` : null;

    updateSourceAfterFetch(source.id, {
      fetchedAt: finishedAt,
      successAt: finishedAt,
      error: errorMessage
    });
    recordFetchEvent({
      sourceId: source.id,
      status,
      articlesFound: fetched.length,
      articlesInserted,
      articlesUpdated,
      errorMessage,
      startedAt,
      finishedAt
    });

    return {
      sourceId: source.id,
      sourceName: source.name,
      status,
      articlesFound: fetched.length,
      articlesInserted,
      articlesUpdated,
      matchesCreated,
      errorMessage
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const errorMessage = truncateError(error);
    db.update(newsSources)
      .set({
        lastFetchedAt: finishedAt,
        lastError: errorMessage,
        updatedAt: finishedAt
      })
      .where(eq(newsSources.id, source.id))
      .run();
    recordFetchEvent({
      sourceId: source.id,
      status: 'failed',
      articlesFound: 0,
      articlesInserted: 0,
      articlesUpdated: 0,
      errorMessage,
      startedAt,
      finishedAt
    });

    return {
      sourceId: source.id,
      sourceName: source.name,
      status: 'failed',
      articlesFound: 0,
      articlesInserted: 0,
      articlesUpdated: 0,
      matchesCreated: 0,
      errorMessage
    };
  }
}

export function cleanupNewsFetchEvents(now = new Date()): {
  successDeleted: number;
  issueDeleted: number;
} {
  const successCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const issueCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const sqlite = getSqlite();

  const successDeleted = sqlite
    .prepare("DELETE FROM news_fetch_events WHERE status = 'success' AND created_at < ?")
    .run(successCutoff).changes;
  const issueDeleted = sqlite
    .prepare(
      "DELETE FROM news_fetch_events WHERE status IN ('partial', 'failed') AND created_at < ?"
    )
    .run(issueCutoff).changes;

  return { successDeleted, issueDeleted };
}

export async function fetchDueNews(options: FetchOptions = {}): Promise<NewsFetchSummary> {
  const now = options.now ?? new Date();
  const provider = options.provider ?? new RssNewsProvider();
  const sources = options.onlyDue === false ? listNewsSources(false) : listDueNewsSources(now);
  const results: NewsFetchSourceResult[] = [];

  for (const source of sources) {
    results.push(await ingestSource(source, provider, now));
  }

  const cleanup = cleanupNewsFetchEvents(now);

  return {
    status: 'ok',
    sourcesChecked: sources.length,
    articlesFound: results.reduce((total, result) => total + result.articlesFound, 0),
    articlesInserted: results.reduce((total, result) => total + result.articlesInserted, 0),
    articlesUpdated: results.reduce((total, result) => total + result.articlesUpdated, 0),
    matchesCreated: results.reduce((total, result) => total + result.matchesCreated, 0),
    failures: results.filter((result) => result.status === 'failed').length,
    cleanup,
    sources: results
  };
}
