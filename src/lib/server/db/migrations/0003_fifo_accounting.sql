CREATE TABLE IF NOT EXISTS asset_lots (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL,
  source_transaction_id TEXT NOT NULL,
  original_quantity TEXT NOT NULL,
  remaining_quantity TEXT NOT NULL,
  cost_basis_total TEXT NOT NULL,
  cost_basis_per_unit TEXT NOT NULL,
  fiat_currency TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (source_transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS asset_lots_source_transaction_unique
ON asset_lots(source_transaction_id);

CREATE INDEX IF NOT EXISTS asset_lots_asset_acquired_idx
ON asset_lots(asset_id, acquired_at, created_at);

CREATE INDEX IF NOT EXISTS asset_lots_remaining_idx
ON asset_lots(asset_id, remaining_quantity);

CREATE TABLE IF NOT EXISTS lot_disposals (
  id TEXT PRIMARY KEY NOT NULL,
  sell_transaction_id TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  quantity_sold TEXT NOT NULL,
  proceeds_amount TEXT NOT NULL,
  cost_basis_amount TEXT NOT NULL,
  realized_profit TEXT NOT NULL,
  disposed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (sell_transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (lot_id) REFERENCES asset_lots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS lot_disposals_sell_transaction_idx
ON lot_disposals(sell_transaction_id);

CREATE INDEX IF NOT EXISTS lot_disposals_lot_idx
ON lot_disposals(lot_id);

CREATE INDEX IF NOT EXISTS lot_disposals_disposed_idx
ON lot_disposals(disposed_at);
