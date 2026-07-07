import { json, type RequestEvent } from '@sveltejs/kit';
import { isInternalCronAuthorized } from '$lib/server/internalAuth';
import { fetchDueNews } from '$lib/server/news/ingest';

export async function POST(event: RequestEvent) {
  if (!isInternalCronAuthorized(event.request)) {
    return json({ status: 'unauthorized' }, { status: 401 });
  }

  return json(await fetchDueNews());
}
