import { json } from '@sveltejs/kit';
import { searchAssets } from '$lib/server/assets';
import { z } from 'zod';

const querySchema = z.string().trim().max(80);

export async function GET({ url }) {
  const parsed = querySchema.safeParse(url.searchParams.get('q') ?? '');
  if (!parsed.success) return json({ error: 'Search query is too long.' }, { status: 400 });
  const results = await searchAssets(parsed.data);
  return json(results);
}
