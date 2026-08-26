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

function actionError(error: unknown, fallback: string): string {
  if (error instanceof ZodError) {
    return [...new Set(error.issues.map((issue) => issue.message))].join(' ');
  }
  return getErrorMessage(error, fallback);
}

export const load: PageServerLoad = async () => ({
  planning: await getPortfolioPlanning(),
  baseCurrency: getAppSettings().baseCurrency
});

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
  }
};
