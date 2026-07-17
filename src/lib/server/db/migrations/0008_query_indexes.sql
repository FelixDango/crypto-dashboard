CREATE INDEX IF NOT EXISTS transactions_date_created_idx
ON transactions(transaction_date, created_at);

CREATE INDEX IF NOT EXISTS price_snapshots_currency_captured_idx
ON price_snapshots(fiat_currency, captured_at);

CREATE INDEX IF NOT EXISTS price_update_events_currency_checked_idx
ON price_update_events(fiat_currency, checked_at);
