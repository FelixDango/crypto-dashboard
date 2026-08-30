import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = '2026-08-30T12:00:00.000Z';

function scalar(sqlite: Database.Database, table: string): number {
  return (sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number })
    .count;
}

function seedDatabase(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO assets (id, provider, provider_coin_id, symbol, name, created_at, updated_at)
    VALUES
      ('asset-history', 'coingecko', 'bitcoin', 'BTC', 'Bitcoin', '${now}', '${now}'),
      ('asset-orphan', 'coingecko', 'ethereum', 'ETH', 'Ethereum', '${now}', '${now}');

    INSERT INTO transactions (
      id, asset_id, asset_symbol, asset_name, type, quantity, fiat_amount, fiat_currency,
      transaction_date, created_at, updated_at
    ) VALUES
      ('buy', 'asset-orphan', 'ETH', 'Ethereum', 'buy', '2', '200', 'EUR', '${now}', '${now}', '${now}'),
      ('sell', 'asset-orphan', 'ETH', 'Ethereum', 'sell', '1', '150', 'EUR', '${now}', '${now}', '${now}');

    INSERT INTO import_batches (id, filename, total_rows, imported_rows, duplicate_rows, status, created_at)
    VALUES ('batch', 'test.csv', 2, 2, 0, 'complete', '${now}');

    INSERT INTO asset_lots (
      id, asset_id, source_transaction_id, original_quantity, remaining_quantity,
      cost_basis_total, cost_basis_per_unit, fiat_currency, acquired_at, created_at, updated_at
    ) VALUES ('lot', 'asset-orphan', 'buy', '2', '1', '100', '100', 'EUR', '${now}', '${now}', '${now}');

    INSERT INTO lot_disposals (
      id, sell_transaction_id, lot_id, quantity_sold, proceeds_amount,
      cost_basis_amount, realized_profit, disposed_at, created_at
    ) VALUES ('disposal', 'sell', 'lot', '1', '150', '100', '50', '${now}', '${now}');

    INSERT INTO portfolio_snapshots (
      id, snapshot_type, base_currency, bucket_at, total_value, total_invested,
      unrealized_profit, roi_percent, holdings_json, prices_json, price_status, captured_at, created_at
    ) VALUES ('snapshot', 'daily', 'EUR', '${now}', '100', '100', '0', '0', '[]', '[]', 'fresh', '${now}', '${now}');

    INSERT INTO price_snapshots (id, asset_id, fiat_currency, price, source, captured_at)
    VALUES ('price', 'asset-orphan', 'EUR', '100', 'test', '${now}');

    INSERT INTO price_update_events (
      id, asset_id, provider, fiat_currency, status, price, checked_at, created_at
    ) VALUES ('price-event', 'asset-orphan', 'coingecko', 'EUR', 'success', '100', '${now}', '${now}');

    INSERT INTO fx_rates (id, rate_date, base_currency, quote_currency, provider, rate, captured_at)
    VALUES ('fx', '2026-08-30', 'USD', 'EUR', 'test', '0.9', '${now}');

    INSERT INTO portfolio_plans (id, name, target_value, currency, created_at, updated_at)
    VALUES (1, 'Test plan', '1000', 'EUR', '${now}', '${now}');

    INSERT INTO portfolio_allocation_targets (
      id, plan_id, asset_id, target_percentage, created_at, updated_at
    ) VALUES ('target', 1, 'asset-orphan', '100', '${now}', '${now}');

    INSERT INTO market_daily_points (id, asset_id, base_currency, day, close, source, captured_at)
    VALUES ('point', 'asset-history', 'EUR', '2026-08-29', '100', 'test', '${now}');

    INSERT INTO market_sentiment_snapshots (
      id, provider, observed_on, value, classification, source_url, captured_at
    ) VALUES ('sentiment', 'test', '2026-08-29', '25', 'fear', 'https://example.com', '${now}');

    INSERT INTO market_signal_refresh_state (
      id, asset_id, base_currency, last_attempt_at, last_success_at, updated_at
    ) VALUES ('signal-state', 'asset-history', 'EUR', '${now}', '${now}', '${now}');

    INSERT INTO news_articles (
      id, source_id, url, title, fetched_at, sentiment_label, created_at, updated_at
    ) VALUES ('article', 'coindesk', 'https://example.com/article', 'Test', '${now}', 'neutral', '${now}', '${now}');

    INSERT INTO news_article_asset_matches (
      id, article_id, asset_id, match_type, confidence, matched_terms_json, created_at
    ) VALUES ('match', 'article', 'asset-history', 'symbol', 1, '["BTC"]', '${now}');

    INSERT INTO news_fetch_events (
      id, source_id, status, articles_found, articles_inserted, articles_updated,
      started_at, finished_at, created_at
    ) VALUES ('fetch', 'coindesk', 'success', 1, 1, 0, '${now}', '${now}', '${now}');
  `);
}

async function setup() {
  const directory = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-reset-'));
  const databasePath = path.join(directory, 'test.db');
  process.env.DATABASE_PATH = databasePath;
  process.env.BASE_CURRENCY = 'EUR';
  process.env.PRICE_PROVIDER = 'coingecko';
  const { getSqlite } = await import('../src/lib/server/db/client');
  const sqlite = getSqlite();
  seedDatabase(sqlite);
  const reset = await import('../src/lib/server/reset');
  return { sqlite, ...reset };
}

const confirmed = {
  scope: 'portfolio' as const,
  acknowledged: true as const,
  confirmationPhrase: 'DELETE ALL TEST DATA' as const
};

describe('safe historical-data reset', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('rejects missing acknowledgement, a wrong phrase, and an invalid scope', async () => {
    const { resetRequestSchema } = await import('../src/lib/validation/reset');
    expect(resetRequestSchema.safeParse({ ...confirmed, acknowledged: false }).success).toBe(false);
    expect(
      resetRequestSchema.safeParse({ ...confirmed, confirmationPhrase: 'DELETE' }).success
    ).toBe(false);
    expect(resetRequestSchema.safeParse({ ...confirmed, scope: 'everything' }).success).toBe(false);
  });

  it('previews exact Scope A counts and preserves news, signal history, settings, and migrations', async () => {
    const { sqlite, getResetPreview, resetHistoricalData } = await setup();
    const migrationCount = scalar(sqlite, '__drizzle_migrations');
    const sourceCount = scalar(sqlite, 'news_sources');
    const preview = getResetPreview('portfolio', sqlite);
    expect(preview.counts.manualTransactions).toBe(2);
    expect(preview.counts.orphanedAssets).toBe(1);

    const result = resetHistoricalData(confirmed, { sqlite, log: false });
    expect(result.counts.manualTransactions).toBe(2);
    expect(scalar(sqlite, 'transactions')).toBe(0);
    expect(scalar(sqlite, 'portfolio_snapshots')).toBe(0);
    expect(scalar(sqlite, 'portfolio_plans')).toBe(0);
    expect(scalar(sqlite, 'news_articles')).toBe(1);
    expect(scalar(sqlite, 'news_fetch_events')).toBe(1);
    expect(scalar(sqlite, 'market_daily_points')).toBe(1);
    expect(scalar(sqlite, 'market_sentiment_snapshots')).toBe(1);
    expect(scalar(sqlite, 'settings')).toBeGreaterThan(0);
    expect(scalar(sqlite, 'news_sources')).toBe(sourceCount);
    expect(scalar(sqlite, '__drizzle_migrations')).toBe(migrationCount);
    expect(sqlite.prepare('SELECT id FROM assets').all()).toEqual([{ id: 'asset-history' }]);
  });

  it('deletes full history while preserving configuration and migration history', async () => {
    const { sqlite, resetHistoricalData } = await setup();
    const migrationCount = scalar(sqlite, '__drizzle_migrations');
    const settingsCount = scalar(sqlite, 'settings');
    const sourcesCount = scalar(sqlite, 'news_sources');
    const signalSettingsCount = scalar(sqlite, 'market_signal_settings');
    const cycleSettingsCount = scalar(sqlite, 'market_cycle_settings');

    const result = resetHistoricalData({ ...confirmed, scope: 'full' }, { sqlite, log: false });
    expect(result.counts.newsArticles).toBe(1);
    expect(result.counts.marketDailyHistory).toBe(1);
    expect(scalar(sqlite, 'news_articles')).toBe(0);
    expect(scalar(sqlite, 'news_fetch_events')).toBe(0);
    expect(scalar(sqlite, 'market_daily_points')).toBe(0);
    expect(scalar(sqlite, 'market_sentiment_snapshots')).toBe(0);
    expect(scalar(sqlite, 'assets')).toBe(0);
    expect(scalar(sqlite, 'settings')).toBe(settingsCount);
    expect(scalar(sqlite, 'news_sources')).toBe(sourcesCount);
    expect(scalar(sqlite, 'market_signal_settings')).toBe(signalSettingsCount);
    expect(scalar(sqlite, 'market_cycle_settings')).toBe(cycleSettingsCount);
    expect(scalar(sqlite, '__drizzle_migrations')).toBe(migrationCount);
  });

  it('rolls every deletion back after a simulated failure', async () => {
    const { sqlite, resetHistoricalData } = await setup();
    const before = {
      transactions: scalar(sqlite, 'transactions'),
      lots: scalar(sqlite, 'asset_lots'),
      plans: scalar(sqlite, 'portfolio_plans')
    };

    expect(() =>
      resetHistoricalData(confirmed, {
        sqlite,
        failAfterCategory: 'manualTransactions',
        log: false
      })
    ).toThrow(/Simulated reset failure/);

    expect(scalar(sqlite, 'transactions')).toBe(before.transactions);
    expect(scalar(sqlite, 'asset_lots')).toBe(before.lots);
    expect(scalar(sqlite, 'portfolio_plans')).toBe(before.plans);
  });

  it('is idempotent and leaves the dashboard portfolio in a safe empty state', async () => {
    const { sqlite, resetHistoricalData } = await setup();
    resetHistoricalData({ ...confirmed, scope: 'full' }, { sqlite, log: false });
    const second = resetHistoricalData({ ...confirmed, scope: 'full' }, { sqlite, log: false });
    expect(second.totalRows).toBe(0);

    const { getPortfolioOverview } = await import('../src/lib/server/portfolio/service');
    const overview = await getPortfolioOverview({ now: new Date(now) });
    expect(overview.holdings).toEqual([]);
    expect(overview.totals.currentValue).toBe('0');
    expect(overview.totals.roiPercent).toBe('0');
  });
});
