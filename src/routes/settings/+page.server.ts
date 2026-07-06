import { fail } from '@sveltejs/kit';
import { getDatabasePath } from '$lib/server/db/client';
import { getAppSettings, updateAppSettings } from '$lib/server/settings';
import { listPriceProviders } from '$lib/server/prices/providers';
import { settingsSchema } from '$lib/validation/settings';
import { rebuildPortfolioAccounting } from '$lib/server/portfolio/accounting';

export function load() {
  return {
    settings: getAppSettings(),
    providers: listPriceProviders(),
    databasePath: getDatabasePath(),
    version: process.env.npm_package_version ?? '0.1.0',
    nodeEnv: process.env.NODE_ENV ?? 'development'
  };
}

export const actions = {
  update: async ({ request }) => {
    const formData = await request.formData();
    const parsed = settingsSchema.safeParse({
      baseCurrency: formData.get('base_currency')?.toString(),
      priceProvider: formData.get('price_provider')?.toString()
    });

    if (!parsed.success) {
      return fail(400, { error: 'Invalid settings.' });
    }

    updateAppSettings(parsed.data);
    await rebuildPortfolioAccounting();
    return { success: true };
  }
};
