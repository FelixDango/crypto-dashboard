import { json } from '@sveltejs/kit';
import { getAnalyticsHealthSummary } from '$lib/server/analytics/history-health';

export async function GET() {
  return json(await getAnalyticsHealthSummary());
}
