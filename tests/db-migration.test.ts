import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

describe('database migrations', () => {
  it('creates the core SQLite tables', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-'));
    process.env.DATABASE_PATH = path.join(dir, 'test.db');

    const { getSqlite } = await import('../src/lib/server/db/client');
    const sqlite = getSqlite();
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toContain('assets');
    expect(tables).toContain('transactions');
    expect(tables).toContain('price_snapshots');
    expect(tables).toContain('fx_rates');
    expect(tables).toContain('import_batches');
    expect(tables).toContain('settings');

    const transactionColumns = sqlite
      .prepare('PRAGMA table_info(transactions)')
      .all()
      .map((row) => (row as { name: string }).name);
    expect(transactionColumns).toContain('import_batch_id');
    expect(transactionColumns).toContain('row_hash');
  });
});
