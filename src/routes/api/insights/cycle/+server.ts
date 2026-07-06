import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
  getActiveCycleSettings,
  getCurrentCyclePhase,
  getCycleProgress,
  getNextCycleTransition,
  getPreviousCycleTransition
} from '$lib/server/insights/market-cycle';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const GET: RequestHandler = ({ url }) => {
  const rawDate = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const parsed = dateSchema.safeParse(rawDate);
  if (!parsed.success) {
    return json({ error: 'Invalid date. Use YYYY-MM-DD.' }, { status: 400 });
  }

  const date = new Date(`${parsed.data}T00:00:00.000Z`);

  return json({
    model: 'custom_cycle_model',
    disclaimer: 'Personal custom cycle model, not a prediction or financial advice.',
    settings: getActiveCycleSettings(),
    current: getCurrentCyclePhase(date),
    progress: getCycleProgress(date),
    previousTransition: getPreviousCycleTransition(date),
    nextTransition: getNextCycleTransition(date)
  });
};
