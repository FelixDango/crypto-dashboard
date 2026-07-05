CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('hourly', 'daily')),
  base_currency TEXT NOT NULL CHECK (base_currency IN ('EUR', 'USD')),
  bucket_at TEXT NOT NULL,
  total_value TEXT NOT NULL,
  total_invested TEXT NOT NULL,
  unrealized_profit TEXT NOT NULL,
  roi_percent TEXT NOT NULL,
  holdings_json TEXT NOT NULL,
  prices_json TEXT NOT NULL,
  price_status TEXT NOT NULL CHECK (price_status IN ('fresh', 'stale', 'failed')),
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_snapshots_bucket_unique
  ON portfolio_snapshots (snapshot_type, base_currency, bucket_at);

CREATE INDEX IF NOT EXISTS portfolio_snapshots_base_type_bucket_idx
  ON portfolio_snapshots (base_currency, snapshot_type, bucket_at);
