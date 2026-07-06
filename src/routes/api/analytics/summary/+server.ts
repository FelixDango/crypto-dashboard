import { json } from '@sveltejs/kit';
import { getAnalyticsSummary } from '$lib/server/analytics/service';

export async function GET() {
  return json(await getAnalyticsSummary());
}
