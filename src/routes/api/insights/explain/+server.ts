import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { explainPortfolioMove, type ExplainRange } from '$lib/server/insights/explain';

const rangeSchema = z.enum(['24h', '7d', '30d']);

export const GET: RequestHandler = async ({ url }) => {
  const parsed = rangeSchema.safeParse(url.searchParams.get('range') ?? '24h');
  if (!parsed.success) {
    return json({ error: 'Invalid explain range.' }, { status: 400 });
  }

  return json(await explainPortfolioMove(parsed.data as ExplainRange));
};
