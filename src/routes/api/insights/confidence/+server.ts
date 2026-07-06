import { json } from '@sveltejs/kit';
import { getDataConfidence } from '$lib/server/insights/data-confidence';

export async function GET() {
  return json(await getDataConfidence());
}
