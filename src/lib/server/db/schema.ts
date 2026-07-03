import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

type Currency = 'EUR' | 'USD';
type TransactionType = 'buy' | 'sell';

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
    )
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

export type AssetRow = typeof assets.$inferSelect;
export type NewAssetRow = typeof assets.$inferInsert;
export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
export type PriceSnapshotRow = typeof priceSnapshots.$inferSelect;
export type FxRateRow = typeof fxRates.$inferSelect;
export type ImportBatchRow = typeof importBatches.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
