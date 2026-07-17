import { fail } from '@sveltejs/kit';
import { getDatabasePath, getSqlite } from '$lib/server/db/client';
import { getAppSettings, updateAppSettings } from '$lib/server/settings';
import { listPriceProviders } from '$lib/server/prices/providers';
import { settingsSchema } from '$lib/validation/settings';
import {
  preparePortfolioAccounting,
  replacePortfolioAccounting
} from '$lib/server/portfolio/accounting';
import { serializePortfolioMutation } from '$lib/server/portfolio/mutation';
import { listTransactionsWithAssets } from '$lib/server/transactions';
import { getErrorMessage } from '$lib/server/errors';

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

    try {
      await serializePortfolioMutation(async () => {
        const plan = await preparePortfolioAccounting(
          listTransactionsWithAssets(),
          parsed.data.baseCurrency
        );
        getSqlite().transaction(() => {
          updateAppSettings(parsed.data);
          replacePortfolioAccounting(plan);
        })();
      });
    } catch (error) {
      return fail(400, { error: getErrorMessage(error, 'Settings could not be updated.') });
    }
    return { success: true };
  }
};
