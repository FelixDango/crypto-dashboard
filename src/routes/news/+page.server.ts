import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { listAssets } from '$lib/server/assets';
import {
  NEWS_ARTICLE_SORTS,
  NEWS_CONTEXT_LABELS,
  NEWS_RANGES,
  type NewsArticleSort,
  type NewsRange
} from '$lib/server/news/context';
import { getNewsDashboardData, type NewsDashboardFilters } from '$lib/server/news/dashboard';
import { fetchDueNews } from '$lib/server/news/ingest';
import type { NewsSentimentLabel } from '$lib/server/news/themes';

const querySchema = z.object({
  range: z.enum(NEWS_RANGES).default('24h'),
  assetId: z.string().trim().default(''),
  sourceId: z.string().trim().default(''),
  theme: z.string().trim().default(''),
  sentimentLabel: z.enum(NEWS_CONTEXT_LABELS).nullable().default(null),
  q: z.string().trim().max(120).default(''),
  matchedOnly: z.boolean().default(false),
  sort: z.enum(NEWS_ARTICLE_SORTS).default('latest')
});

function optionalParam(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key)?.trim();
  return value ? value : undefined;
}

function boolParam(url: URL, key: string): boolean {
  const value = url.searchParams.get(key);
  return value === '1' || value === 'true' || value === 'on';
}

function parseFilters(url: URL): NewsDashboardFilters {
  const parsed = querySchema.safeParse({
    range: optionalParam(url, 'range') ?? '24h',
    assetId: optionalParam(url, 'assetId') ?? optionalParam(url, 'asset') ?? '',
    sourceId: optionalParam(url, 'sourceId') ?? optionalParam(url, 'source') ?? '',
    theme: optionalParam(url, 'theme') ?? '',
    sentimentLabel:
      optionalParam(url, 'sentimentLabel') ?? optionalParam(url, 'contextLabel') ?? null,
    q: optionalParam(url, 'q') ?? '',
    matchedOnly: boolParam(url, 'matchedOnly'),
    sort: optionalParam(url, 'sort') ?? 'latest'
  });

  if (!parsed.success) {
    return {
      range: '24h',
      assetId: '',
      sourceId: '',
      theme: '',
      sentimentLabel: null,
      q: '',
      matchedOnly: false,
      sort: 'latest'
    };
  }

  return {
    range: parsed.data.range as NewsRange,
    assetId: parsed.data.assetId,
    sourceId: parsed.data.sourceId,
    theme: parsed.data.theme,
    sentimentLabel: parsed.data.sentimentLabel as NewsSentimentLabel | null,
    q: parsed.data.q,
    matchedOnly: parsed.data.matchedOnly,
    sort: parsed.data.sort as NewsArticleSort
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'News fetch failed.';
}

export const load: PageServerLoad = async ({ url }) => {
  const filters = parseFilters(url);
  const dashboard = await getNewsDashboardData(filters);

  return {
    range: filters.range,
    ranges: NEWS_RANGES.map((value) => ({ value, label: value })),
    sortOptions: [
      { value: 'latest', label: 'Latest first' },
      { value: 'matched', label: 'Matched first' },
      { value: 'source', label: 'Source grouped' }
    ] satisfies Array<{ value: NewsArticleSort; label: string }>,
    filters,
    contextLabels: NEWS_CONTEXT_LABELS,
    assets: listAssets(),
    dashboard
  };
};

export const actions: Actions = {
  fetchNow: async () => {
    try {
      return {
        fetchSummary: await fetchDueNews({ onlyDue: false })
      };
    } catch (error) {
      return fail(500, {
        fetchError: errorMessage(error)
      });
    }
  }
};
