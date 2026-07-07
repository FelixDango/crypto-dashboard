import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { NEWS_RANGES, getAssetNewsContext, type NewsRange } from '$lib/server/news/context';

const rangeSchema = z.enum(NEWS_RANGES);

export const GET: RequestHandler = ({ params, url }) => {
  const parsed = rangeSchema.safeParse(url.searchParams.get('range') ?? '24h');
  if (!parsed.success) {
    return json({ error: 'Invalid news context range.' }, { status: 400 });
  }

  const context = getAssetNewsContext(params.assetId, parsed.data as NewsRange);
  if (!context.asset) {
    return json({ error: 'Asset not found.' }, { status: 404 });
  }

  return json(context);
};
