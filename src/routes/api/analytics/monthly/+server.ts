import { json } from '@sveltejs/kit';
import { getAnalyticsMonthly } from '$lib/server/analytics/service';

export async function GET() {
  return json(await getAnalyticsMonthly());
}
