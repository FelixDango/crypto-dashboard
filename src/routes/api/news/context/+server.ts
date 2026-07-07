import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { NEWS_RANGES, getPortfolioNewsContext, type NewsRange } from '$lib/server/news/context';

const rangeSchema = z.enum(NEWS_RANGES);

export const GET: RequestHandler = async ({ url }) => {
  const parsed = rangeSchema.safeParse(url.searchParams.get('range') ?? '24h');
  if (!parsed.success) {
    return json({ error: 'Invalid news context range.' }, { status: 400 });
  }

  return json(await getPortfolioNewsContext(parsed.data as NewsRange));
};
