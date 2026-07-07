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
    expect(tables).toContain('portfolio_snapshots');
    expect(tables).toContain('price_update_events');
    expect(tables).toContain('asset_lots');
    expect(tables).toContain('lot_disposals');
    expect(tables).toContain('fx_rates');
    expect(tables).toContain('import_batches');
    expect(tables).toContain('settings');
    expect(tables).toContain('news_sources');
    expect(tables).toContain('news_articles');
    expect(tables).toContain('news_article_asset_matches');
    expect(tables).toContain('news_fetch_events');

    const transactionColumns = sqlite
      .prepare('PRAGMA table_info(transactions)')
      .all()
      .map((row) => (row as { name: string }).name);
    expect(transactionColumns).toContain('import_batch_id');
    expect(transactionColumns).toContain('row_hash');

    const snapshotIndexes = sqlite
      .prepare("PRAGMA index_list('portfolio_snapshots')")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(snapshotIndexes).toContain('portfolio_snapshots_bucket_unique');

    const lotColumns = sqlite
      .prepare('PRAGMA table_info(asset_lots)')
      .all()
      .map((row) => (row as { name: string }).name);
    expect(lotColumns).toContain('remaining_quantity');
    expect(lotColumns).toContain('cost_basis_per_unit');

    const eventColumns = sqlite
      .prepare('PRAGMA table_info(price_update_events)')
      .all()
      .map((row) => (row as { name: string }).name);
    expect(eventColumns).toContain('status');
    expect(eventColumns).toContain('checked_at');

    const newsArticleColumns = sqlite
      .prepare('PRAGMA table_info(news_articles)')
      .all()
      .map((row) => (row as { name: string }).name);
    expect(newsArticleColumns).toContain('sentiment_label');
    expect(newsArticleColumns).toContain('raw_themes_json');
  });
});
