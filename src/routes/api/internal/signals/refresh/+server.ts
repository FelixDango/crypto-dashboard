import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isInternalCronAuthorized } from '$lib/server/internalAuth';
import { refreshPlannedMarketSignals } from '$lib/server/signals/refresh';

export const POST: RequestHandler = async ({ request }) => {
  if (!isInternalCronAuthorized(request)) {
    return json({ status: 'unauthorized' }, { status: 401 });
  }
  return json(await refreshPlannedMarketSignals({ limit: 2 }));
};
