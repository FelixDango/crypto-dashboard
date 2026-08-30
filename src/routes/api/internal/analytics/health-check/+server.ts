import { json, type RequestEvent } from '@sveltejs/kit';
import { getAnalyticsHealthSummary } from '$lib/server/analytics/history-health';
import { isInternalCronAuthorized } from '$lib/server/internalAuth';
import { cleanupPriceUpdateEvents } from '$lib/server/prices/events';
import { cleanupPortfolioSnapshots } from '$lib/server/portfolio/snapshots';

export async function POST(event: RequestEvent) {
  if (!isInternalCronAuthorized(event.request)) {
    return json({ status: 'unauthorized' }, { status: 401 });
  }

  const health = await getAnalyticsHealthSummary();
  const cleanup = {
    priceUpdateEvents: cleanupPriceUpdateEvents(),
    portfolioSnapshots: cleanupPortfolioSnapshots()
  };

  return json({
    status: 'ok',
    health,
    cleanup
  });
}
