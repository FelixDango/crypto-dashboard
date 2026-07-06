import { error } from '@sveltejs/kit';
import { getAssetAccountingOverview } from '$lib/server/portfolio/service';
import { getAppSettings } from '$lib/server/settings';

export async function load({ params }) {
  const overview = await getAssetAccountingOverview(params.assetId);
  if (!overview) {
    throw error(404, 'Asset not found.');
  }

  return { ...overview, baseCurrency: getAppSettings().baseCurrency };
}
