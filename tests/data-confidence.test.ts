import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function resetDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-confidence-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.BASE_CURRENCY = 'EUR';
  process.env.PRICE_PROVIDER = 'coingecko';
  process.env.PRICE_CACHE_TTL_SECONDS = '600';
  process.env.INTERNAL_CRON_SECRET = 'test-secret';
}

async function seedHolding(fiatAmount = '100') {
  const { createTransaction } = await import('../src/lib/server/transactions');

  await createTransaction({
    asset: {
      provider: 'coingecko',
      providerCoinId: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin'
    },
    type: 'buy',
    quantity: '1',
    fiatAmount,
    fiatCurrency: 'EUR',
    feeAmount: '0',
    feeCurrency: 'EUR',
    transactionDate: '2026-07-06T10:00:00.000Z'
  });
}

async function insertSnapshot(
  snapshotType: 'hourly' | 'daily',
  bucketAt: string,
  capturedAt = bucketAt
) {
  const { db } = await import('../src/lib/server/db/client');
  const { portfolioSnapshots } = await import('../src/lib/server/db/schema');

  db.insert(portfolioSnapshots)
    .values({
      id: randomUUID(),
      snapshotType,
      baseCurrency: 'EUR',
      bucketAt,
      totalValue: '100',
      totalInvested: '80',
      unrealizedProfit: '20',
      roiPercent: '25',
      holdingsJson: '[]',
      pricesJson: '[]',
      priceStatus: 'fresh',
      capturedAt,
      createdAt: capturedAt
    })
    .run();
}

async function insertPrice(price = '100', capturedAt = '2026-07-06T11:50:00.000Z') {
  const { db } = await import('../src/lib/server/db/client');
  const { priceSnapshots } = await import('../src/lib/server/db/schema');

  db.insert(priceSnapshots)
    .values({
      id: randomUUID(),
      assetId: 'coingecko:bitcoin',
      fiatCurrency: 'EUR',
      price,
      source: 'test',
      capturedAt
    })
    .run();
}

describe('data confidence', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDatabase();
  });

  it('scores healthy snapshots, prices, transactions, and accounting', async () => {
    await seedHolding();
    await insertPrice();
    await insertSnapshot('hourly', '2026-07-06T11:00:00.000Z');
    await insertSnapshot('daily', '2026-07-06T00:00:00.000Z');
    const { getDataConfidence } = await import('../src/lib/server/insights/data-confidence');

    const confidence = await getDataConfidence({ now: new Date('2026-07-06T12:00:00.000Z') });

    expect(confidence.categories.snapshots.status).toBe('healthy');
    expect(confidence.categories.prices.status).toBe('healthy');
    expect(confidence.categories.transactions.status).toBe('healthy');
    expect(confidence.categories.accounting.status).toBe('healthy');
    expect(confidence.score).toBe(100);
  });

  it('flags missing snapshots', async () => {
    const { getDataConfidence } = await import('../src/lib/server/insights/data-confidence');

    const confidence = await getDataConfidence({ now: new Date('2026-07-06T12:00:00.000Z') });

    expect(confidence.categories.snapshots.status).toBe('broken');
    expect(confidence.categories.snapshots.issues.join(' ')).toContain('No hourly snapshots');
  });

  it('flags stale prices for held assets', async () => {
    await seedHolding();
    await insertPrice('100', '2026-07-06T10:00:00.000Z');
    const { getDataConfidence } = await import('../src/lib/server/insights/data-confidence');

    const confidence = await getDataConfidence({ now: new Date('2026-07-06T12:00:00.000Z') });

    expect(confidence.categories.prices.status).toBe('warning');
    expect(confidence.categories.prices.issues[0]).toContain('BTC');
  });

  it('flags suspicious implied transaction prices when nearby market data exists', async () => {
    await seedHolding('10000');
    await insertPrice('100', '2026-07-06T10:05:00.000Z');
    const { getDataConfidence } = await import('../src/lib/server/insights/data-confidence');

    const confidence = await getDataConfidence({ now: new Date('2026-07-06T12:00:00.000Z') });

    expect(confidence.categories.transactions.issues.join(' ')).toContain(
      'suspicious implied price'
    );
  });
});
