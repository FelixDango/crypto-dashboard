import { error } from '@sveltejs/kit';
import { NEWS_RANGES, getAssetNewsContext, type NewsRange } from '$lib/server/news/context';
import { getAssetAccountingOverview } from '$lib/server/portfolio/service';
import { getAppSettings } from '$lib/server/settings';

function validRange(value: string | null): NewsRange {
  return NEWS_RANGES.includes(value as NewsRange) ? (value as NewsRange) : '7d';
}

export async function load({ params, url }) {
  const overview = await getAssetAccountingOverview(params.assetId);
  if (!overview) {
    throw error(404, 'Asset not found.');
  }

  const newsRange = validRange(url.searchParams.get('newsRange'));

  return {
    ...overview,
    baseCurrency: getAppSettings().baseCurrency,
    newsRange,
    newsRanges: NEWS_RANGES.map((value) => ({ value, label: value })),
    newsContext: getAssetNewsContext(params.assetId, newsRange)
  };
}
