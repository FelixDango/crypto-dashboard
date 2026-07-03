import { json } from '@sveltejs/kit';
import { listAssets } from '$lib/server/assets';
import { getAppSettings } from '$lib/server/settings';
import { getCachedPricesForAssets } from '$lib/server/prices/cache';

export function GET() {
  const settings = getAppSettings();
  const prices = getCachedPricesForAssets(
    listAssets(),
    settings.baseCurrency,
    settings.priceProvider
  );
  return json({ prices });
}
