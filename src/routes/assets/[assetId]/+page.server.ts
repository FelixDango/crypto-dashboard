import { error } from '@sveltejs/kit';
import { getAssetOverview } from '$lib/server/portfolio/service';
import { getAppSettings } from '$lib/server/settings';

export async function load({ params }) {
  const asset = await getAssetOverview(params.assetId);
  if (!asset) {
    throw error(404, 'Asset not found.');
  }

  return { asset, baseCurrency: getAppSettings().baseCurrency };
}
