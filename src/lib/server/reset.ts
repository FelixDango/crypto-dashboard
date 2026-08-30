import type Database from 'better-sqlite3';
import { getSqlite } from '$lib/server/db/client';
import { resetRequestSchema, type ResetRequest, type ResetScope } from '$lib/validation/reset';
import { logInfo } from '$lib/server/logger';

export type ResetCategory =
  | 'manualTransactions'
  | 'csvImportBatches'
  | 'accountingPositions'
  | 'accountingDisposals'
  | 'portfolioSnapshots'
  | 'currentPriceCache'
  | 'priceUpdateEvents'
  | 'fxRateCache'
  | 'portfolioPlans'
  | 'portfolioPlanTargets'
  | 'marketDailyHistory'
  | 'marketSentimentHistory'
  | 'marketSignalRefreshHistory'
  | 'newsArticles'
  | 'newsAssetMatches'
  | 'newsFetchEvents'
  | 'orphanedAssets';

export type ResetCounts = Record<ResetCategory, number>;

export type ResetPreview = {
  scope: ResetScope;
  counts: ResetCounts;
  totalRows: number;
};

export type ResetResult = ResetPreview;

export const RESET_CATEGORY_LABELS: Record<ResetCategory, string> = {
  manualTransactions: 'Manual transactions',
  csvImportBatches: 'CSV import batches',
  accountingPositions: 'Derived accounting positions',
  accountingDisposals: 'Derived accounting disposals',
  portfolioSnapshots: 'Portfolio snapshots',
  currentPriceCache: 'Current price cache',
  priceUpdateEvents: 'Price-update events',
  fxRateCache: 'FX-rate cache',
  portfolioPlans: 'Portfolio plans',
  portfolioPlanTargets: 'Portfolio plan targets',
  marketDailyHistory: 'Market daily history',
  marketSentimentHistory: 'Market sentiment history',
  marketSignalRefreshHistory: 'Market-signal refresh history',
  newsArticles: 'News articles',
  newsAssetMatches: 'News/asset matches',
  newsFetchEvents: 'News fetch events',
  orphanedAssets: 'Orphaned asset records'
};

const PORTFOLIO_CATEGORIES: ResetCategory[] = [
  'manualTransactions',
  'csvImportBatches',
  'accountingPositions',
  'accountingDisposals',
  'portfolioSnapshots',
  'currentPriceCache',
  'priceUpdateEvents',
  'fxRateCache',
  'portfolioPlans',
  'portfolioPlanTargets',
  'orphanedAssets'
];

const FULL_ONLY_CATEGORIES: ResetCategory[] = [
  'marketDailyHistory',
  'marketSentimentHistory',
  'marketSignalRefreshHistory',
  'newsArticles',
  'newsAssetMatches',
  'newsFetchEvents'
];

export function resetCategories(scope: ResetScope): ResetCategory[] {
  return scope === 'full'
    ? [...PORTFOLIO_CATEGORIES.slice(0, -1), ...FULL_ONLY_CATEGORIES, 'orphanedAssets']
    : [...PORTFOLIO_CATEGORIES];
}

function emptyCounts(): ResetCounts {
  return Object.fromEntries(
    Object.keys(RESET_CATEGORY_LABELS).map((key) => [key, 0])
  ) as ResetCounts;
}

function count(sqlite: Database.Database, sql: string): number {
  return (sqlite.prepare(sql).get() as { count: number }).count;
}

function orphanedAssetCount(sqlite: Database.Database, scope: ResetScope): number {
  if (scope === 'full') return count(sqlite, 'SELECT COUNT(*) AS count FROM assets');
  return count(
    sqlite,
    `SELECT COUNT(*) AS count
     FROM assets AS asset
     WHERE NOT EXISTS (
       SELECT 1 FROM market_daily_points WHERE market_daily_points.asset_id = asset.id
     )
       AND NOT EXISTS (
         SELECT 1 FROM market_signal_refresh_state WHERE market_signal_refresh_state.asset_id = asset.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM news_article_asset_matches WHERE news_article_asset_matches.asset_id = asset.id
       )`
  );
}

export function getResetPreview(
  scope: ResetScope,
  sqlite: Database.Database = getSqlite()
): ResetPreview {
  const counts = emptyCounts();
  counts.manualTransactions = count(sqlite, 'SELECT COUNT(*) AS count FROM transactions');
  counts.csvImportBatches = count(sqlite, 'SELECT COUNT(*) AS count FROM import_batches');
  counts.accountingPositions = count(sqlite, 'SELECT COUNT(*) AS count FROM asset_lots');
  counts.accountingDisposals = count(sqlite, 'SELECT COUNT(*) AS count FROM lot_disposals');
  counts.portfolioSnapshots = count(sqlite, 'SELECT COUNT(*) AS count FROM portfolio_snapshots');
  counts.currentPriceCache = count(sqlite, 'SELECT COUNT(*) AS count FROM price_snapshots');
  counts.priceUpdateEvents = count(sqlite, 'SELECT COUNT(*) AS count FROM price_update_events');
  counts.fxRateCache = count(sqlite, 'SELECT COUNT(*) AS count FROM fx_rates');
  counts.portfolioPlans = count(sqlite, 'SELECT COUNT(*) AS count FROM portfolio_plans');
  counts.portfolioPlanTargets = count(
    sqlite,
    'SELECT COUNT(*) AS count FROM portfolio_allocation_targets'
  );
  counts.orphanedAssets = orphanedAssetCount(sqlite, scope);

  if (scope === 'full') {
    counts.marketDailyHistory = count(sqlite, 'SELECT COUNT(*) AS count FROM market_daily_points');
    counts.marketSentimentHistory = count(
      sqlite,
      'SELECT COUNT(*) AS count FROM market_sentiment_snapshots'
    );
    counts.marketSignalRefreshHistory = count(
      sqlite,
      'SELECT COUNT(*) AS count FROM market_signal_refresh_state'
    );
    counts.newsArticles = count(sqlite, 'SELECT COUNT(*) AS count FROM news_articles');
    counts.newsAssetMatches = count(
      sqlite,
      'SELECT COUNT(*) AS count FROM news_article_asset_matches'
    );
    counts.newsFetchEvents = count(sqlite, 'SELECT COUNT(*) AS count FROM news_fetch_events');
  }

  return {
    scope,
    counts,
    totalRows: resetCategories(scope).reduce((total, category) => total + counts[category], 0)
  };
}

type ResetOptions = {
  sqlite?: Database.Database;
  /** Test-only fault injection used to prove transaction rollback. */
  failAfterCategory?: ResetCategory;
  log?: boolean;
};

export function resetHistoricalData(
  request: ResetRequest,
  options: ResetOptions = {}
): ResetResult {
  const validated = resetRequestSchema.parse(request);
  const sqlite = options.sqlite ?? getSqlite();
  const counts = emptyCounts();

  const remove = (category: ResetCategory, sql: string): void => {
    counts[category] = sqlite.prepare(sql).run().changes;
    if (options.failAfterCategory === category) {
      throw new Error(`Simulated reset failure after ${category}.`);
    }
  };

  const transaction = sqlite.transaction(() => {
    remove('accountingDisposals', 'DELETE FROM lot_disposals');
    remove('accountingPositions', 'DELETE FROM asset_lots');
    remove('portfolioPlanTargets', 'DELETE FROM portfolio_allocation_targets');
    remove('portfolioPlans', 'DELETE FROM portfolio_plans');
    remove('manualTransactions', 'DELETE FROM transactions');
    remove('csvImportBatches', 'DELETE FROM import_batches');
    remove('portfolioSnapshots', 'DELETE FROM portfolio_snapshots');
    remove('currentPriceCache', 'DELETE FROM price_snapshots');
    remove('priceUpdateEvents', 'DELETE FROM price_update_events');
    remove('fxRateCache', 'DELETE FROM fx_rates');

    if (validated.scope === 'full') {
      remove('newsAssetMatches', 'DELETE FROM news_article_asset_matches');
      remove('newsArticles', 'DELETE FROM news_articles');
      remove('newsFetchEvents', 'DELETE FROM news_fetch_events');
      remove('marketSignalRefreshHistory', 'DELETE FROM market_signal_refresh_state');
      remove('marketDailyHistory', 'DELETE FROM market_daily_points');
      remove('marketSentimentHistory', 'DELETE FROM market_sentiment_snapshots');
      remove('orphanedAssets', 'DELETE FROM assets');
    } else {
      remove(
        'orphanedAssets',
        `DELETE FROM assets
         WHERE NOT EXISTS (
           SELECT 1 FROM market_daily_points WHERE market_daily_points.asset_id = assets.id
         )
           AND NOT EXISTS (
             SELECT 1 FROM market_signal_refresh_state WHERE market_signal_refresh_state.asset_id = assets.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM news_article_asset_matches WHERE news_article_asset_matches.asset_id = assets.id
           )`
      );
    }
  });

  transaction();
  const result = {
    scope: validated.scope,
    counts,
    totalRows: resetCategories(validated.scope).reduce(
      (total, category) => total + counts[category],
      0
    )
  } satisfies ResetResult;

  if (options.log !== false) {
    logInfo('historical_data_reset', { scope: result.scope, ...result.counts });
  }
  return result;
}
