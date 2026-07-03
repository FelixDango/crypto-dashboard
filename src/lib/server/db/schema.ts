import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    transactionDate: text('transaction_date').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull()
  },
  (table) => ({
    assetDateIndex: index('transactions_asset_date_idx').on(table.assetId, table.transactionDate),
    typeIndex: index('transactions_type_idx').on(table.type)
  })
);

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

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
});

export type AssetRow = typeof assets.$inferSelect;
export type NewAssetRow = typeof assets.$inferInsert;
export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
export type PriceSnapshotRow = typeof priceSnapshots.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
