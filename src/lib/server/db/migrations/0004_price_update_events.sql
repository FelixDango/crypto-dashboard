CREATE TABLE IF NOT EXISTS price_update_events (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT,
  provider TEXT NOT NULL,
  fiat_currency TEXT NOT NULL CHECK (fiat_currency IN ('EUR', 'USD')),
  status TEXT NOT NULL CHECK (status IN ('success', 'stale_fallback', 'failed')),
  price TEXT,
  error_message TEXT,
  checked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS price_update_events_asset_currency_checked_idx
ON price_update_events(asset_id, fiat_currency, checked_at);

CREATE INDEX IF NOT EXISTS price_update_events_status_checked_idx
ON price_update_events(status, checked_at);
