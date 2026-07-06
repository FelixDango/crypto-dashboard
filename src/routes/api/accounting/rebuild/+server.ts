import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rebuildPortfolioAccounting } from '$lib/server/portfolio/accounting';

export const POST: RequestHandler = async () => {
  const result = await rebuildPortfolioAccounting();
  return json({
    status: 'ok',
    ...result
  });
};
