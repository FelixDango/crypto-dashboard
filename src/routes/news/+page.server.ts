import type { PageServerLoad } from './$types';
import { listAssets } from '$lib/server/assets';
import {
  NEWS_CONTEXT_LABELS,
  NEWS_RANGES,
  getPortfolioNewsContext,
  listNewsArticles,
  type NewsRange
} from '$lib/server/news/context';
import { getNewsHealth } from '$lib/server/news/health';

function optionalParam(url: URL, key: string): string {
  return url.searchParams.get(key)?.trim() ?? '';
}

function validRange(value: string): NewsRange {
  return NEWS_RANGES.includes(value as NewsRange) ? (value as NewsRange) : '24h';
}

export const load: PageServerLoad = async ({ url }) => {
  const range = validRange(optionalParam(url, 'range'));
  const filters = {
    assetId: optionalParam(url, 'assetId') || optionalParam(url, 'asset'),
    sourceId: optionalParam(url, 'sourceId') || optionalParam(url, 'source'),
    theme: optionalParam(url, 'theme'),
    sentimentLabel: optionalParam(url, 'sentimentLabel') || optionalParam(url, 'contextLabel')
  };
  const health = getNewsHealth();
  const recentForOptions = listNewsArticles({ range, limit: 250 });
  const themes = [...new Set(recentForOptions.flatMap((article) => article.themes))].sort((a, b) =>
    a.localeCompare(b)
  );
  const [context, articles] = await Promise.all([
    getPortfolioNewsContext(range),
    Promise.resolve(
      listNewsArticles({
        ...filters,
        sentimentLabel: NEWS_CONTEXT_LABELS.includes(filters.sentimentLabel as never)
          ? (filters.sentimentLabel as never)
          : null,
        range,
        limit: 100
      })
    )
  ]);

  return {
    range,
    ranges: NEWS_RANGES.map((value) => ({ value, label: value })),
    filters,
    contextLabels: NEWS_CONTEXT_LABELS,
    themes,
    assets: listAssets(),
    health,
    sources: health.sources,
    articles,
    context
  };
};
