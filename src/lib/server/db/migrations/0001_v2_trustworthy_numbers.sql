ALTER TABLE transactions ADD COLUMN import_batch_id TEXT;
ALTER TABLE transactions ADD COLUMN row_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_row_hash_unique
  ON transactions (row_hash);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY NOT NULL,
  filename TEXT,
  total_rows INTEGER NOT NULL,
  imported_rows INTEGER NOT NULL,
  duplicate_rows INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fx_rates (
  id TEXT PRIMARY KEY NOT NULL,
  rate_date TEXT NOT NULL,
  base_currency TEXT NOT NULL CHECK (base_currency IN ('EUR', 'USD')),
  quote_currency TEXT NOT NULL CHECK (quote_currency IN ('EUR', 'USD')),
  provider TEXT NOT NULL,
  rate TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS fx_rates_lookup_unique
  ON fx_rates (rate_date, base_currency, quote_currency, provider);
