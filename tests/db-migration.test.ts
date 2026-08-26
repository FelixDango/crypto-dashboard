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
    expect(tables).toContain('portfolio_plans');
    expect(tables).toContain('portfolio_allocation_targets');
    expect(tables).toContain('market_daily_points');
    expect(tables).toContain('market_sentiment_snapshots');
    expect(tables).toContain('market_signal_refresh_state');
    expect(tables).toContain('market_signal_settings');
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

    const transactionIndexes = sqlite
      .prepare("PRAGMA index_list('transactions')")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(transactionIndexes).toContain('transactions_date_created_idx');

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

    const planningTargetIndexes = sqlite
      .prepare("PRAGMA index_list('portfolio_allocation_targets')")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(planningTargetIndexes).toContain('portfolio_allocation_targets_plan_asset_unique');

    const marketPointIndexes = sqlite
      .prepare("PRAGMA index_list('market_daily_points')")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(marketPointIndexes).toEqual(
      expect.arrayContaining([
        'market_daily_points_asset_currency_day_source_unique',
        'market_daily_points_asset_currency_day_idx'
      ])
    );

    const planningForeignKeys = sqlite
      .prepare('PRAGMA foreign_key_list(portfolio_allocation_targets)')
      .all() as Array<{
      table: string;
    }>;
    expect(planningForeignKeys.map((row) => row.table)).toEqual(
      expect.arrayContaining(['portfolio_plans', 'assets'])
    );

    const signalForeignKeys = sqlite
      .prepare('PRAGMA foreign_key_list(market_signal_refresh_state)')
      .all() as Array<{ table: string }>;
    expect(signalForeignKeys.map((row) => row.table)).toContain('assets');
    const marketPointForeignKeys = sqlite
      .prepare('PRAGMA foreign_key_list(market_daily_points)')
      .all() as Array<{ table: string }>;
    expect(marketPointForeignKeys.map((row) => row.table)).toContain('assets');

    const signalSettings = sqlite.prepare('SELECT * FROM market_signal_settings').all();
    expect(signalSettings).toHaveLength(1);
    expect(signalSettings[0]).toMatchObject({
      id: 1,
      fear_greed_max: '25',
      rsi_14_max: '30',
      sma_200_deviation_max: '-10',
      drawdown_365_max: '-30',
      bollinger_z_max: '-1.5',
      required_favorable_count: 4
    });
    expect(() =>
      sqlite
        .prepare(
          `
          INSERT INTO market_signal_settings
            (id, fear_greed_max, rsi_14_max, sma_200_deviation_max, drawdown_365_max,
             bollinger_z_max, required_favorable_count, created_at, updated_at)
          VALUES (2, '25', '30', '-10', '-30', '-1.5', 4, 'now', 'now')
        `
        )
        .run()
    ).toThrow();

    const newsSourceIds = sqlite
      .prepare('SELECT id FROM news_sources ORDER BY id')
      .all()
      .map((row) => (row as { id: string }).id);
    expect(newsSourceIds).toEqual(
      expect.arrayContaining([
        'bitcoin-core',
        'cryptoslate',
        'ethereum-foundation-blog',
        'the-block'
      ])
    );

    const migrationRows = sqlite
      .prepare('SELECT hash, checksum FROM __drizzle_migrations')
      .all() as Array<{ hash: string; checksum: string | null }>;
    expect(migrationRows.length).toBeGreaterThan(0);
    expect(migrationRows.every((row) => row.checksum?.length === 64)).toBe(true);
  });
});
