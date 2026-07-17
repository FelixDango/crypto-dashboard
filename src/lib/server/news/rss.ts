import type { FetchedArticle, NewsProvider, NewsSource } from './provider';
import { normalizeArticleUrl } from './provider';
import { fetchWithResilience, readTextResponse } from '$lib/server/http';

const DEFAULT_TIMEOUT_MS = 10_000;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function cleanText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const withoutCdata = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const withoutTags = withoutCdata.replace(/<[^>]+>/g, ' ');
  const cleaned = decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function getTag(block: string, tagName: string): string | undefined {
  const escaped = tagName.replace(':', '\\:');
  const match = block.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return cleanText(match?.[1]);
}

function getRawTag(block: string, tagName: string): string | undefined {
  const escaped = tagName.replace(':', '\\:');
  const match = block.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match?.[1];
}

function getAtomLink(block: string): string | undefined {
  const alternate =
    block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1] ??
    block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*\/?>/i)?.[1];
  if (alternate) return decodeEntities(alternate).trim();

  return block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1]?.trim();
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function blocks(xml: string, tagName: 'item' | 'entry'): string[] {
  return [...xml.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi'))].map(
    (match) => match[1]
  );
}

function feedLanguage(xml: string): string | undefined {
  return (
    getTag(xml, 'language') ?? getTag(xml, 'dc:language') ?? getTag(xml, 'feedburner:language')
  );
}

function rssArticle(block: string, sourceName: string, language?: string): FetchedArticle | null {
  const rawLink = getTag(block, 'link') ?? getAtomLink(block);
  const url = normalizeArticleUrl(rawLink ?? '');
  const title = getTag(block, 'title');
  if (!url || !title) return null;

  return {
    externalId: getTag(block, 'guid') ?? url,
    url,
    title,
    summary: cleanText(getRawTag(block, 'description') ?? getRawTag(block, 'content:encoded')),
    publishedAt: parseDate(getTag(block, 'pubDate') ?? getTag(block, 'dc:date')),
    sourceName,
    language
  };
}

function atomArticle(block: string, sourceName: string, language?: string): FetchedArticle | null {
  const url = normalizeArticleUrl(getAtomLink(block) ?? '');
  const title = getTag(block, 'title');
  if (!url || !title) return null;

  return {
    externalId: getTag(block, 'id') ?? url,
    url,
    title,
    summary: cleanText(getRawTag(block, 'summary') ?? getRawTag(block, 'content')),
    publishedAt: parseDate(getTag(block, 'published') ?? getTag(block, 'updated')),
    sourceName,
    language
  };
}

export function parseRssFeed(xml: string, sourceName = 'RSS'): FetchedArticle[] {
  if (!xml.trim()) return [];

  try {
    const language = feedLanguage(xml);
    const rssItems = blocks(xml, 'item')
      .map((block) => rssArticle(block, sourceName, language))
      .filter((article): article is FetchedArticle => article !== null);

    if (rssItems.length > 0) return rssItems;

    return blocks(xml, 'entry')
      .map((block) => atomArticle(block, sourceName, language))
      .filter((article): article is FetchedArticle => article !== null);
  } catch {
    return [];
  }
}

export class RssNewsProvider implements NewsProvider {
  constructor(private readonly timeoutMs = DEFAULT_TIMEOUT_MS) {}

  async fetchSource(source: NewsSource): Promise<FetchedArticle[]> {
    if (source.type !== 'rss') return [];

    const response = await fetchWithResilience(
      source.url,
      {
        headers: {
          accept:
            'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9,*/*;q=0.8',
          'user-agent': 'personal-krypto-dashboard-news-context/1.0'
        }
      },
      { timeoutMs: this.timeoutMs, maxRetries: 2 }
    );

    if (!response.ok) {
      throw new Error(`${source.name} returned HTTP ${response.status}.`);
    }

    const xml = await readTextResponse(response);
    return parseRssFeed(xml, source.name);
  }
}
