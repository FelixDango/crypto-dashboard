import { json } from '@sveltejs/kit';
import { listAssets } from '$lib/server/assets';
import { getAppSettings } from '$lib/server/settings';
import { refreshCurrentPricesForAssets } from '$lib/server/prices/cache';

export async function POST() {
  const settings = getAppSettings();
  const prices = await refreshCurrentPricesForAssets(
    listAssets(),
    settings.baseCurrency,
    settings.priceProvider
  );
  return json({ prices, refreshedAt: new Date().toISOString() });
}
