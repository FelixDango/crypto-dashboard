import { randomUUID } from 'node:crypto';
import { openDatabase, runMigrations, getDatabasePath } from './db-utils.mjs';

const db = openDatabase();
runMigrations(db);

const now = new Date().toISOString();

const assets = [
  {
    id: 'coingecko:bitcoin',
    provider: 'coingecko',
    provider_coin_id: 'bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    image_url: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png'
  },
  {
    id: 'coingecko:ethereum',
    provider: 'coingecko',
    provider_coin_id: 'ethereum',
    symbol: 'ETH',
    name: 'Ethereum',
    image_url: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png'
  }
];

const transactions = [
  {
    asset_id: 'coingecko:bitcoin',
    asset_symbol: 'BTC',
    asset_name: 'Bitcoin',
    type: 'buy',
    quantity: '0.025',
    fiat_amount: '1200',
    fiat_currency: 'EUR',
    fee_amount: '3.5',
    fee_currency: 'EUR',
    transaction_date: '2025-01-12T12:00:00.000Z',
    notes: 'Demo BTC buy'
  },
  {
    asset_id: 'coingecko:ethereum',
    asset_symbol: 'ETH',
    asset_name: 'Ethereum',
    type: 'buy',
    quantity: '0.8',
    fiat_amount: '1850',
    fiat_currency: 'EUR',
    fee_amount: '4.2',
    fee_currency: 'EUR',
    transaction_date: '2025-03-02T12:00:00.000Z',
    notes: 'Demo ETH buy'
  },
  {
    asset_id: 'coingecko:ethereum',
    asset_symbol: 'ETH',
    asset_name: 'Ethereum',
    type: 'sell',
    quantity: '0.15',
    fiat_amount: '410',
    fiat_currency: 'EUR',
    fee_amount: '1.2',
    fee_currency: 'EUR',
    transaction_date: '2025-06-20T12:00:00.000Z',
    notes: 'Demo partial sell'
  }
];

const insertAsset = db.prepare(`
  INSERT INTO assets (id, provider, provider_coin_id, symbol, name, image_url, created_at, updated_at)
  VALUES (@id, @provider, @provider_coin_id, @symbol, @name, @image_url, @created_at, @updated_at)
  ON CONFLICT(provider, provider_coin_id) DO UPDATE SET
    symbol = excluded.symbol,
    name = excluded.name,
    image_url = excluded.image_url,
    updated_at = excluded.updated_at
`);

const insertTransaction = db.prepare(`
  INSERT INTO transactions (
    id, asset_id, asset_symbol, asset_name, type, quantity, fiat_amount, fiat_currency,
    fee_amount, fee_currency, transaction_date, notes, created_at, updated_at
  )
  VALUES (
    @id, @asset_id, @asset_symbol, @asset_name, @type, @quantity, @fiat_amount, @fiat_currency,
    @fee_amount, @fee_currency, @transaction_date, @notes, @created_at, @updated_at
  )
`);

const insertPrice = db.prepare(`
  INSERT INTO price_snapshots (id, asset_id, fiat_currency, price, source, captured_at)
  VALUES (@id, @asset_id, @fiat_currency, @price, @source, @captured_at)
`);

const existingTransactions = db.prepare('SELECT COUNT(*) AS count FROM transactions').get().count;

db.transaction(() => {
  for (const asset of assets) {
    insertAsset.run({ ...asset, created_at: now, updated_at: now });
  }

  db.prepare(
    `
    INSERT INTO settings (key, value)
    VALUES ('base_currency', 'EUR')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `
  ).run();

  db.prepare(
    `
    INSERT INTO settings (key, value)
    VALUES ('price_provider', 'coingecko')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `
  ).run();

  if (existingTransactions === 0) {
    for (const transaction of transactions) {
      insertTransaction.run({
        ...transaction,
        id: randomUUID(),
        created_at: now,
        updated_at: now
      });
    }
  }

  insertPrice.run({
    id: randomUUID(),
    asset_id: 'coingecko:bitcoin',
    fiat_currency: 'EUR',
    price: '97000',
    source: 'seed',
    captured_at: now
  });

  insertPrice.run({
    id: randomUUID(),
    asset_id: 'coingecko:ethereum',
    fiat_currency: 'EUR',
    price: '3150',
    source: 'seed',
    captured_at: now
  });
})();

db.close();
console.log(`Seed data written to ${getDatabasePath()}`);
