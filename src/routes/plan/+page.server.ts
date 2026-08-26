import { fail } from '@sveltejs/kit';
import { ZodError } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { calculateContributionScenario } from '$lib/planning/calculations';
import { getErrorMessage } from '$lib/server/errors';
import {
  clearPortfolioPlan,
  getPortfolioPlanning,
  savePortfolioPlan
} from '$lib/server/planning/service';
import { getAppSettings } from '$lib/server/settings';
import {
  contributionAmountSchema,
  parsePortfolioPlanForm,
  planDraftFromForm
} from '$lib/validation/planning';
import { getPlannedAssetMarketSignals } from '$lib/server/signals/service';
import { refreshPlannedAssetMarketSignals } from '$lib/server/signals/refresh';
import { z } from 'zod';

function actionError(error: unknown, fallback: string): string {
  if (error instanceof ZodError) {
    return [...new Set(error.issues.map((issue) => issue.message))].join(' ');
  }
  return getErrorMessage(error, fallback);
}

export const load: PageServerLoad = async () => {
  const planning = await getPortfolioPlanning();
  return {
    planning,
    marketSignals: getPlannedAssetMarketSignals(planning),
    baseCurrency: getAppSettings().baseCurrency
  };
};

export const actions: Actions = {
  save: async ({ request }) => {
    const formData = await request.formData();
    const draft = planDraftFromForm(formData);
    try {
      const settings = getAppSettings();
      savePortfolioPlan(parsePortfolioPlanForm(formData, settings.baseCurrency));
      return { success: true, intent: 'save' as const };
    } catch (error) {
      return fail(400, {
        error: actionError(error, 'Portfolio plan could not be saved.'),
        intent: 'save' as const,
        draft
      });
    }
  },

  clear: async () => {
    try {
      clearPortfolioPlan();
      return { success: true, intent: 'clear' as const };
    } catch (error) {
      return fail(400, {
        error: actionError(error, 'Portfolio plan could not be cleared.'),
        intent: 'clear' as const
      });
    }
  },

  scenario: async ({ request }) => {
    const formData = await request.formData();
    const contribution = formData.get('contribution')?.toString() ?? '';
    try {
      const amount = contributionAmountSchema.parse(contribution);
      const scenario = calculateContributionScenario(await getPortfolioPlanning(), amount);
      return { success: true, intent: 'scenario' as const, contribution, scenario };
    } catch (error) {
      return fail(400, {
        error: actionError(error, 'Contribution scenario could not be calculated.'),
        intent: 'scenario' as const,
        contribution
      });
    }
  },

  refreshSignals: async ({ request }) => {
    const formData = await request.formData();
    const parsed = z.string().min(1).max(200).safeParse(formData.get('asset_id'));
    if (!parsed.success) {
      return fail(400, {
        error: 'Choose a valid planned asset to refresh.',
        intent: 'refreshSignals' as const
      });
    }
    try {
      const result = await refreshPlannedAssetMarketSignals(parsed.data);
      return {
        success: true,
        intent: 'refreshSignals' as const,
        refreshedAssetId: parsed.data,
        sentimentWarning:
          result.sentiment === 'failed'
            ? 'Asset history refreshed, but global sentiment could not be updated.'
            : null
      };
    } catch (error) {
      return fail(502, {
        error: actionError(error, 'Market signals could not be refreshed.'),
        intent: 'refreshSignals' as const,
        refreshedAssetId: parsed.data
      });
    }
  }
};
