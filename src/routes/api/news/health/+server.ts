import { json } from '@sveltejs/kit';
import { getNewsHealth } from '$lib/server/news/health';

export function GET() {
  return json(getNewsHealth());
}
