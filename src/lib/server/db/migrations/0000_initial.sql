CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  provider_coin_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS assets_provider_coin_unique
  ON assets (provider, provider_coin_id);

CREATE INDEX IF NOT EXISTS assets_symbol_idx
  ON assets (symbol);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL,
  asset_symbol TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  quantity TEXT NOT NULL,
  fiat_amount TEXT NOT NULL,
  fiat_currency TEXT NOT NULL CHECK (fiat_currency IN ('EUR', 'USD')),
  fee_amount TEXT,
  fee_currency TEXT CHECK (fee_currency IN ('EUR', 'USD') OR fee_currency IS NULL),
  transaction_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS transactions_asset_date_idx
  ON transactions (asset_id, transaction_date);

CREATE INDEX IF NOT EXISTS transactions_type_idx
  ON transactions (type);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL,
  fiat_currency TEXT NOT NULL CHECK (fiat_currency IN ('EUR', 'USD')),
  price TEXT NOT NULL,
  source TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS price_snapshots_asset_currency_captured_idx
  ON price_snapshots (asset_id, fiat_currency, captured_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value)
VALUES
  ('base_currency', 'EUR'),
  ('price_provider', 'coingecko')
ON CONFLICT(key) DO NOTHING;
