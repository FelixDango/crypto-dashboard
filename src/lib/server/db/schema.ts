import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

type Currency = 'EUR' | 'USD';
type TransactionType = 'buy' | 'sell';
type PortfolioSnapshotType = 'hourly' | 'daily';
type PortfolioSnapshotPriceStatus = 'fresh' | 'stale' | 'failed';
type PriceUpdateEventStatus = 'success' | 'stale_fallback' | 'failed';
type NewsSourceType = 'rss';
type NewsSentimentLabel = 'positive' | 'neutral' | 'negative' | 'mixed' | 'unknown';
type NewsAssetMatchType = 'symbol' | 'name' | 'alias' | 'manual';
type NewsFetchEventStatus = 'success' | 'partial' | 'failed';

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    providerCoinId: text('provider_coin_id').notNull(),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    imageUrl: text('image_url'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => ({
    providerCoinUnique: uniqueIndex('assets_provider_coin_unique').on(
      table.provider,
      table.providerCoinId
    ),
    symbolIndex: index('assets_symbol_idx').on(table.symbol)
  })
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    assetSymbol: text('asset_symbol').notNull(),
    assetName: text('asset_name').notNull(),
    type: text('type').$type<TransactionType>().notNull(),
    quantity: text('quantity').notNull(),
    fiatAmount: text('fiat_amount').notNull(),
    fiatCurrency: text('fiat_currency').$type<Currency>().notNull(),
    feeAmount: text('fee_amount'),
    feeCurrency: text('fee_currency').$type<Currency>(),
    importBatchId: text('import_batch_id'),
    rowHash: text('row_hash'),
    transactionDate: text('transaction_date').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => ({
    assetDateIndex: index('transactions_asset_date_idx').on(table.assetId, table.transactionDate),
    dateCreatedIndex: index('transactions_date_created_idx').on(
      table.transactionDate,
      table.createdAt
    ),
    typeIndex: index('transactions_type_idx').on(table.type),
    rowHashUnique: uniqueIndex('transactions_row_hash_unique').on(table.rowHash)
  })
);

export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(),
  filename: text('filename'),
  totalRows: integer('total_rows').notNull(),
  importedRows: integer('imported_rows').notNull(),
  duplicateRows: integer('duplicate_rows').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull()
});

export const priceSnapshots = sqliteTable(
  'price_snapshots',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    fiatCurrency: text('fiat_currency').$type<Currency>().notNull(),
    price: text('price').notNull(),
    source: text('source').notNull(),
    capturedAt: text('captured_at').notNull()
  },
  (table) => ({
    assetCurrencyCapturedIndex: index('price_snapshots_asset_currency_captured_idx').on(
      table.assetId,
      table.fiatCurrency,
      table.capturedAt
    ),
    currencyCapturedIndex: index('price_snapshots_currency_captured_idx').on(
      table.fiatCurrency,
      table.capturedAt
    )
  })
);

export const portfolioSnapshots = sqliteTable(
  'portfolio_snapshots',
  {
    id: text('id').primaryKey(),
    snapshotType: text('snapshot_type').$type<PortfolioSnapshotType>().notNull(),
    baseCurrency: text('base_currency').$type<Currency>().notNull(),
    bucketAt: text('bucket_at').notNull(),
    totalValue: text('total_value').notNull(),
    totalInvested: text('total_invested').notNull(),
    unrealizedProfit: text('unrealized_profit').notNull(),
    roiPercent: text('roi_percent').notNull(),
    holdingsJson: text('holdings_json').notNull(),
    pricesJson: text('prices_json').notNull(),
    priceStatus: text('price_status').$type<PortfolioSnapshotPriceStatus>().notNull(),
    capturedAt: text('captured_at').notNull(),
    createdAt: text('created_at').notNull()
  },
  (table) => ({
    bucketUnique: uniqueIndex('portfolio_snapshots_bucket_unique').on(
      table.snapshotType,
      table.baseCurrency,
      table.bucketAt
    ),
    baseTypeBucketIndex: index('portfolio_snapshots_base_type_bucket_idx').on(
      table.baseCurrency,
      table.snapshotType,
      table.bucketAt
    )
  })
);

export const priceUpdateEvents = sqliteTable(
  'price_update_events',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    fiatCurrency: text('fiat_currency').$type<Currency>().notNull(),
    status: text('status').$type<PriceUpdateEventStatus>().notNull(),
    price: text('price'),
    errorMessage: text('error_message'),
    checkedAt: text('checked_at').notNull(),
    createdAt: text('created_at').notNull()
  },
  (table) => ({
    assetCurrencyCheckedIndex: index('price_update_events_asset_currency_checked_idx').on(
      table.assetId,
      table.fiatCurrency,
      table.checkedAt
    ),
    statusCheckedIndex: index('price_update_events_status_checked_idx').on(
      table.status,
      table.checkedAt
    ),
    currencyCheckedIndex: index('price_update_events_currency_checked_idx').on(
      table.fiatCurrency,
      table.checkedAt
    )
  })
);

export const assetLots = sqliteTable(
  'asset_lots',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    sourceTransactionId: text('source_transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    originalQuantity: text('original_quantity').notNull(),
    remainingQuantity: text('remaining_quantity').notNull(),
    costBasisTotal: text('cost_basis_total').notNull(),
    costBasisPerUnit: text('cost_basis_per_unit').notNull(),
    fiatCurrency: text('fiat_currency').$type<Currency>().notNull(),
    acquiredAt: text('acquired_at').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => ({
    sourceTransactionUnique: uniqueIndex('asset_lots_source_transaction_unique').on(
      table.sourceTransactionId
    ),
    assetAcquiredIndex: index('asset_lots_asset_acquired_idx').on(
      table.assetId,
      table.acquiredAt,
      table.createdAt
    ),
    remainingIndex: index('asset_lots_remaining_idx').on(table.assetId, table.remainingQuantity)
  })
);

export const lotDisposals = sqliteTable(
  'lot_disposals',
  {
    id: text('id').primaryKey(),
    sellTransactionId: text('sell_transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    lotId: text('lot_id')
      .notNull()
      .references(() => assetLots.id, { onDelete: 'cascade' }),
    quantitySold: text('quantity_sold').notNull(),
    proceedsAmount: text('proceeds_amount').notNull(),
    costBasisAmount: text('cost_basis_amount').notNull(),
    realizedProfit: text('realized_profit').notNull(),
    disposedAt: text('disposed_at').notNull(),
    createdAt: text('created_at').notNull()
  },
  (table) => ({
    sellTransactionIndex: index('lot_disposals_sell_transaction_idx').on(table.sellTransactionId),
    lotIndex: index('lot_disposals_lot_idx').on(table.lotId),
    disposedIndex: index('lot_disposals_disposed_idx').on(table.disposedAt)
  })
);

export const fxRates = sqliteTable(
  'fx_rates',
  {
    id: text('id').primaryKey(),
    rateDate: text('rate_date').notNull(),
    baseCurrency: text('base_currency').$type<Currency>().notNull(),
    quoteCurrency: text('quote_currency').$type<Currency>().notNull(),
    provider: text('provider').notNull(),
    rate: text('rate').notNull(),
    capturedAt: text('captured_at').notNull()
  },
  (table) => ({
    rateLookupUnique: uniqueIndex('fx_rates_lookup_unique').on(
      table.rateDate,
      table.baseCurrency,
      table.quoteCurrency,
      table.provider
    )
  })
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
});

export const marketCycleSettings = sqliteTable('market_cycle_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  firstBullStartDate: text('first_bull_start_date').notNull(),
  firstBullEndDateExclusive: text('first_bull_end_date_exclusive').notNull(),
  firstBearStartDate: text('first_bear_start_date').notNull(),
  firstBearEndDateExclusive: text('first_bear_end_date_exclusive').notNull(),
  recurrenceStartDate: text('recurrence_start_date').notNull(),
  recurringBullDurationDays: integer('recurring_bull_duration_days').notNull(),
  recurringBearDurationDays: integer('recurring_bear_duration_days').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const newsSources = sqliteTable(
  'news_sources',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').$type<NewsSourceType>().notNull(),
    url: text('url').notNull(),
    isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull(),
    fetchIntervalMinutes: integer('fetch_interval_minutes').notNull(),
    lastFetchedAt: text('last_fetched_at'),
    lastSuccessAt: text('last_success_at'),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => ({
    enabledIndex: index('news_sources_enabled_idx').on(table.isEnabled),
    fetchDueIndex: index('news_sources_fetch_due_idx').on(table.isEnabled, table.lastFetchedAt)
  })
);

export const newsArticles = sqliteTable(
  'news_articles',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => newsSources.id, { onDelete: 'cascade' }),
    externalId: text('external_id'),
    url: text('url').notNull(),
    canonicalUrl: text('canonical_url'),
    title: text('title').notNull(),
    summary: text('summary'),
    publishedAt: text('published_at'),
    fetchedAt: text('fetched_at').notNull(),
    language: text('language'),
    rawAssetMentionsJson: text('raw_asset_mentions_json'),
    rawThemesJson: text('raw_themes_json'),
    sentimentLabel: text('sentiment_label').$type<NewsSentimentLabel>().notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => ({
    urlUnique: uniqueIndex('news_articles_url_unique').on(table.url),
    sourceExternalUnique: uniqueIndex('news_articles_source_external_unique').on(
      table.sourceId,
      table.externalId
    ),
    sourcePublishedIndex: index('news_articles_source_published_idx').on(
      table.sourceId,
      table.publishedAt
    ),
    fetchedIndex: index('news_articles_fetched_idx').on(table.fetchedAt)
  })
);

export const newsArticleAssetMatches = sqliteTable(
  'news_article_asset_matches',
  {
    id: text('id').primaryKey(),
    articleId: text('article_id')
      .notNull()
      .references(() => newsArticles.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    matchType: text('match_type').$type<NewsAssetMatchType>().notNull(),
    confidence: real('confidence').notNull(),
    matchedTermsJson: text('matched_terms_json').notNull(),
    createdAt: text('created_at').notNull()
  },
  (table) => ({
    articleAssetUnique: uniqueIndex('news_article_asset_matches_article_asset_unique').on(
      table.articleId,
      table.assetId
    ),
    assetConfidenceIndex: index('news_article_asset_matches_asset_confidence_idx').on(
      table.assetId,
      table.confidence
    )
  })
);

export const newsFetchEvents = sqliteTable(
  'news_fetch_events',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').references(() => newsSources.id, { onDelete: 'set null' }),
    status: text('status').$type<NewsFetchEventStatus>().notNull(),
    articlesFound: integer('articles_found').notNull(),
    articlesInserted: integer('articles_inserted').notNull(),
    articlesUpdated: integer('articles_updated').notNull(),
    errorMessage: text('error_message'),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at').notNull(),
    createdAt: text('created_at').notNull()
  },
  (table) => ({
    statusCreatedIndex: index('news_fetch_events_status_created_idx').on(
      table.status,
      table.createdAt
    ),
    sourceCreatedIndex: index('news_fetch_events_source_created_idx').on(
      table.sourceId,
      table.createdAt
    )
  })
);

export type AssetRow = typeof assets.$inferSelect;
export type NewAssetRow = typeof assets.$inferInsert;
export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
export type PriceSnapshotRow = typeof priceSnapshots.$inferSelect;
export type PortfolioSnapshotRow = typeof portfolioSnapshots.$inferSelect;
export type PriceUpdateEventRow = typeof priceUpdateEvents.$inferSelect;
export type NewPriceUpdateEventRow = typeof priceUpdateEvents.$inferInsert;
export type AssetLotRow = typeof assetLots.$inferSelect;
export type NewAssetLotRow = typeof assetLots.$inferInsert;
export type LotDisposalRow = typeof lotDisposals.$inferSelect;
export type NewLotDisposalRow = typeof lotDisposals.$inferInsert;
export type FxRateRow = typeof fxRates.$inferSelect;
export type ImportBatchRow = typeof importBatches.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
export type MarketCycleSettingsRow = typeof marketCycleSettings.$inferSelect;
export type NewMarketCycleSettingsRow = typeof marketCycleSettings.$inferInsert;
export type NewsSourceRow = typeof newsSources.$inferSelect;
export type NewNewsSourceRow = typeof newsSources.$inferInsert;
export type NewsArticleRow = typeof newsArticles.$inferSelect;
export type NewNewsArticleRow = typeof newsArticles.$inferInsert;
export type NewsArticleAssetMatchRow = typeof newsArticleAssetMatches.$inferSelect;
export type NewNewsArticleAssetMatchRow = typeof newsArticleAssetMatches.$inferInsert;
export type NewsFetchEventRow = typeof newsFetchEvents.$inferSelect;
export type NewNewsFetchEventRow = typeof newsFetchEvents.$inferInsert;
