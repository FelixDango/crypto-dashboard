import { json } from '@sveltejs/kit';
import { getSqlite } from '$lib/server/db/client';

export function GET() {
  getSqlite().prepare('SELECT 1 AS ok').get();
  return json({
    ok: true,
    timestamp: new Date().toISOString()
  });
}
