import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getDatabasePath, getSqlite } from '$lib/server/db/client';

export function GET() {
  const sqlite = getSqlite();
  sqlite.pragma('wal_checkpoint(TRUNCATE)');
  const databasePath = getDatabasePath();
  const filename = `krypto-backup-${new Date().toISOString().slice(0, 10)}.db`;

  return new Response(readFileSync(databasePath), {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-database-file': path.basename(databasePath)
    }
  });
}
