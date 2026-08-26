CREATE TABLE IF NOT EXISTS market_daily_points (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL,
  base_currency TEXT NOT NULL CHECK (base_currency IN ('EUR', 'USD')),
  day TEXT NOT NULL,
  close TEXT NOT NULL,
  volume TEXT,
  source TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS market_daily_points_asset_currency_day_source_unique
  ON market_daily_points(asset_id, base_currency, day, source);

CREATE INDEX IF NOT EXISTS market_daily_points_asset_currency_day_idx
  ON market_daily_points(asset_id, base_currency, day);

CREATE INDEX IF NOT EXISTS market_daily_points_captured_idx
  ON market_daily_points(captured_at);

CREATE TABLE IF NOT EXISTS market_sentiment_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  observed_on TEXT NOT NULL,
  value TEXT NOT NULL,
  classification TEXT NOT NULL,
  source_url TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS market_sentiment_snapshots_provider_observed_unique
  ON market_sentiment_snapshots(provider, observed_on);

CREATE INDEX IF NOT EXISTS market_sentiment_snapshots_provider_captured_idx
  ON market_sentiment_snapshots(provider, captured_at);

CREATE TABLE IF NOT EXISTS market_signal_refresh_state (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL,
  base_currency TEXT NOT NULL CHECK (base_currency IN ('EUR', 'USD')),
  last_attempt_at TEXT NOT NULL,
  last_success_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS market_signal_refresh_state_asset_currency_unique
  ON market_signal_refresh_state(asset_id, base_currency);

CREATE INDEX IF NOT EXISTS market_signal_refresh_state_currency_success_idx
  ON market_signal_refresh_state(base_currency, last_success_at);

CREATE TABLE IF NOT EXISTS market_signal_settings (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  fear_greed_max TEXT NOT NULL,
  rsi_14_max TEXT NOT NULL,
  sma_200_deviation_max TEXT NOT NULL,
  drawdown_365_max TEXT NOT NULL,
  bollinger_z_max TEXT NOT NULL,
  required_favorable_count INTEGER NOT NULL CHECK (required_favorable_count BETWEEN 1 AND 5),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO market_signal_settings (
  id,
  fear_greed_max,
  rsi_14_max,
  sma_200_deviation_max,
  drawdown_365_max,
  bollinger_z_max,
  required_favorable_count,
  created_at,
  updated_at
)
VALUES (
  1,
  '25',
  '30',
  '-10',
  '-30',
  '-1.5',
  4,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(id) DO NOTHING;
