CREATE TABLE IF NOT EXISTS market_cycle_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  first_bull_start_date TEXT NOT NULL,
  first_bull_end_date_exclusive TEXT NOT NULL,
  first_bear_start_date TEXT NOT NULL,
  first_bear_end_date_exclusive TEXT NOT NULL,
  recurrence_start_date TEXT NOT NULL,
  recurring_bull_duration_days INTEGER NOT NULL,
  recurring_bear_duration_days INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS market_cycle_settings_active_idx
ON market_cycle_settings(is_active);

INSERT INTO market_cycle_settings (
  name,
  first_bull_start_date,
  first_bull_end_date_exclusive,
  first_bear_start_date,
  first_bear_end_date_exclusive,
  recurrence_start_date,
  recurring_bull_duration_days,
  recurring_bear_duration_days,
  is_active,
  created_at,
  updated_at
)
SELECT
  'Custom crypto cycle model',
  '2022-11-08',
  '2025-10-06',
  '2025-10-06',
  '2026-10-06',
  '2026-10-06',
  1064,
  365,
  1,
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM market_cycle_settings WHERE is_active = 1
);
