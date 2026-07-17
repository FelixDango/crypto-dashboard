import type { NewsSourceRow } from '$lib/server/db/schema';

export type FetchedArticle = {
  externalId?: string;
  url: string;
  title: string;
  summary?: string;
  publishedAt?: Date;
  sourceName: string;
  language?: string;
};

export type NewsSource = NewsSourceRow;

export interface NewsProvider {
  fetchSource(source: NewsSource): Promise<FetchedArticle[]>;
}

export function normalizeArticleUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}
