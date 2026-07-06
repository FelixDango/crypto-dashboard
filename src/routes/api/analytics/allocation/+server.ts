import { json } from '@sveltejs/kit';
import { getAnalyticsAllocation } from '$lib/server/analytics/service';

export async function GET() {
  return json(await getAnalyticsAllocation());
}
