import { json } from '@sveltejs/kit';
import { listAssets } from '$lib/server/assets';
import { getAppSettings } from '$lib/server/settings';
import { getCurrentPricesForAssets } from '$lib/server/prices/cache';

export async function GET() {
  const settings = getAppSettings();
  const prices = await getCurrentPricesForAssets(
    listAssets(),
    settings.baseCurrency,
    settings.priceProvider
  );
  return json({ prices });
}
