import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnalyticsPerformance } from '$lib/server/analytics/service';
import { parseAnalyticsRange } from '$lib/server/analytics/range';

export const GET: RequestHandler = ({ url }) => {
  const parsed = parseAnalyticsRange(url.searchParams.get('range'));
  if (!parsed.success) {
    return json({ error: 'Invalid analytics range.' }, { status: 400 });
  }

  return json(getAnalyticsPerformance(parsed.data));
};
