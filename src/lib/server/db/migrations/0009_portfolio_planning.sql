CREATE TABLE IF NOT EXISTS portfolio_plans (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  name TEXT NOT NULL,
  target_value TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('EUR', 'USD')),
  target_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_allocation_targets (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id INTEGER NOT NULL,
  asset_id TEXT NOT NULL,
  target_percentage TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (plan_id) REFERENCES portfolio_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_allocation_targets_plan_asset_unique
  ON portfolio_allocation_targets(plan_id, asset_id);

CREATE INDEX IF NOT EXISTS portfolio_allocation_targets_plan_idx
  ON portfolio_allocation_targets(plan_id);
