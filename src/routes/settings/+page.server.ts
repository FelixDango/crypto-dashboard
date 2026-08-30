import { fail, redirect } from '@sveltejs/kit';
import { ZodError } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { getDatabasePath, getSqlite } from '$lib/server/db/client';
import { getAppSettings, updateAppSettings } from '$lib/server/settings';
import { listPriceProviders } from '$lib/server/prices/providers';
import { settingsSchema } from '$lib/validation/settings';
import {
  preparePortfolioAccounting,
  replacePortfolioAccounting
} from '$lib/server/portfolio/accounting';
import { serializePortfolioMutation } from '$lib/server/portfolio/mutation';
import { listCurrentTransactionsWithAssets } from '$lib/server/transactions';
import { getErrorMessage } from '$lib/server/errors';
import {
  applyPlanCurrencyConversion,
  preparePlanCurrencyConversion
} from '$lib/server/planning/service';
import { getMarketSignalSettings, updateMarketSignalSettings } from '$lib/server/signals/settings';
import { parseMarketSignalSettingsForm } from '$lib/validation/market-signals';
import {
  getResetPreview,
  RESET_CATEGORY_LABELS,
  resetCategories,
  resetHistoricalData
} from '$lib/server/reset';
import { parseResetForm } from '$lib/validation/reset';

export const load: PageServerLoad = () => {
  return {
    settings: getAppSettings(),
    signalSettings: getMarketSignalSettings(),
    providers: listPriceProviders(),
    databasePath: getDatabasePath(),
    version: process.env.npm_package_version ?? '0.1.0',
    nodeEnv: process.env.NODE_ENV ?? 'development',
    resetPreviews: {
      portfolio: getResetPreview('portfolio'),
      full: getResetPreview('full')
    },
    resetCategoryLabels: RESET_CATEGORY_LABELS,
    resetCategories: {
      portfolio: resetCategories('portfolio'),
      full: resetCategories('full')
    }
  };
};

export const actions: Actions = {
  update: async ({ request }) => {
    const formData = await request.formData();
    const parsed = settingsSchema.safeParse({
      baseCurrency: formData.get('base_currency')?.toString(),
      priceProvider: formData.get('price_provider')?.toString()
    });

    if (!parsed.success) {
      return fail(400, { error: 'Invalid settings.', intent: 'preferences' as const });
    }

    try {
      await serializePortfolioMutation(async () => {
        const plan = await preparePortfolioAccounting(
          listCurrentTransactionsWithAssets(),
          parsed.data.baseCurrency
        );
        const planCurrencyConversion = await preparePlanCurrencyConversion(
          parsed.data.baseCurrency
        );
        getSqlite().transaction(() => {
          updateAppSettings(parsed.data);
          replacePortfolioAccounting(plan);
          applyPlanCurrencyConversion(planCurrencyConversion);
        })();
      });
    } catch (error) {
      return fail(400, {
        error: getErrorMessage(error, 'Settings could not be updated.'),
        intent: 'preferences' as const
      });
    }
    return { success: true };
  },

  updateSignals: async ({ request }) => {
    const parsed = parseMarketSignalSettingsForm(await request.formData());
    if (!parsed.success) {
      return fail(400, {
        error: [...new Set(parsed.error.issues.map((issue) => issue.message))].join(' '),
        intent: 'signals' as const
      });
    }
    try {
      updateMarketSignalSettings(parsed.data);
      return { success: true, intent: 'signals' as const };
    } catch (error) {
      return fail(400, {
        error: getErrorMessage(error, 'Market signal settings could not be updated.'),
        intent: 'signals' as const
      });
    }
  },

  resetData: async ({ request, cookies }) => {
    try {
      const resetRequest = parseResetForm(await request.formData());
      const result = await serializePortfolioMutation(async () =>
        resetHistoricalData(resetRequest)
      );
      cookies.set(
        'reset_result',
        Buffer.from(JSON.stringify(result), 'utf8').toString('base64url'),
        {
          httpOnly: true,
          sameSite: 'strict',
          path: '/',
          maxAge: 60
        }
      );
    } catch (error) {
      return fail(400, {
        error:
          error instanceof ZodError
            ? [...new Set(error.issues.map((issue) => issue.message))].join(' ')
            : getErrorMessage(error, 'Historical data could not be reset.'),
        intent: 'reset' as const
      });
    }
    throw redirect(303, '/dashboard?reset=complete');
  }
};
