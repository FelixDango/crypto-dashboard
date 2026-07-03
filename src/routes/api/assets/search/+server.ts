import { json } from '@sveltejs/kit';
import { searchAssets } from '$lib/server/assets';

export async function GET({ url }) {
  const query = url.searchParams.get('q') ?? '';
  const results = await searchAssets(query);
  return json(results);
}
