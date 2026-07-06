import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function resetDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-analytics-health-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.BASE_CURRENCY = 'EUR';
  process.env.PRICE_PROVIDER = 'coingecko';
  process.env.PRICE_CACHE_TTL_SECONDS = '600';
  process.env.INTERNAL_CRON_SECRET = 'test-secret';
}

async function insertSnapshot(
  snapshotType: 'hourly' | 'daily',
  bucketAt: string,
  capturedAt = bucketAt,
  priceStatus: 'fresh' | 'stale' | 'failed' = 'fresh'
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
      priceStatus,
      capturedAt,
      createdAt: capturedAt
    })
    .run();
}

async function seedHolding() {
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
    fiatAmount: '100',
    fiatCurrency: 'EUR',
    feeAmount: '0',
    feeCurrency: 'EUR',
    transactionDate: '2026-01-01T12:00:00.000Z'
  });
}

async function insertPrice(capturedAt: string) {
  const { db } = await import('../src/lib/server/db/client');
  const { priceSnapshots } = await import('../src/lib/server/db/schema');

  db.insert(priceSnapshots)
    .values({
      id: randomUUID(),
      assetId: 'coingecko:bitcoin',
      fiatCurrency: 'EUR',
      price: '200',
      source: 'test',
      capturedAt
    })
    .run();
}

describe('analytics history health', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDatabase();
  });

  it('marks missing snapshots as broken', async () => {
    const { getSnapshotHealth } = await import('../src/lib/server/analytics/history-health');

    const health = getSnapshotHealth({ now: new Date('2026-07-06T12:00:00.000Z') });

    expect(health.status).toBe('broken');
    expect(health.hourly.status).toBe('broken');
    expect(health.daily.status).toBe('broken');
  });

  it('marks fresh hourly snapshots as healthy', async () => {
    await insertSnapshot('hourly', '2026-07-06T11:00:00.000Z');
    await insertSnapshot('daily', '2026-07-06T00:00:00.000Z');
    const { getSnapshotHealth } = await import('../src/lib/server/analytics/history-health');

    const health = getSnapshotHealth({ now: new Date('2026-07-06T12:00:00.000Z') });

    expect(health.hourly.status).toBe('healthy');
    expect(health.daily.status).toBe('healthy');
  });

  it('marks stale hourly snapshots as warning', async () => {
    await insertSnapshot('hourly', '2026-07-06T08:00:00.000Z');
    await insertSnapshot('daily', '2026-07-06T00:00:00.000Z');
    const { getSnapshotHealth } = await import('../src/lib/server/analytics/history-health');

    const health = getSnapshotHealth({ now: new Date('2026-07-06T12:00:00.000Z') });

    expect(health.hourly.status).toBe('warning');
  });

  it('marks missing daily snapshots as broken', async () => {
    await insertSnapshot('hourly', '2026-07-06T11:00:00.000Z');
    const { getSnapshotHealth } = await import('../src/lib/server/analytics/history-health');

    const health = getSnapshotHealth({ now: new Date('2026-07-06T12:00:00.000Z') });

    expect(health.daily.status).toBe('broken');
  });

  it('detects hourly gaps', async () => {
    const { detectSnapshotGaps } = await import('../src/lib/server/analytics/history-health');

    const gaps = detectSnapshotGaps('hourly', [
      { bucketAt: '2026-07-06T08:00:00.000Z' },
      { bucketAt: '2026-07-06T10:00:00.000Z' }
    ]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapHours).toBe(2);
  });

  it('detects daily gaps', async () => {
    const { detectSnapshotGaps } = await import('../src/lib/server/analytics/history-health');

    const gaps = detectSnapshotGaps('daily', [
      { bucketAt: '2026-07-01T00:00:00.000Z' },
      { bucketAt: '2026-07-03T00:00:00.000Z' }
    ]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapHours).toBe(48);
  });

  it('detects stale prices', async () => {
    await seedHolding();
    await insertPrice('2026-07-06T10:00:00.000Z');
    const { getPriceHealth } = await import('../src/lib/server/analytics/history-health');

    const health = await getPriceHealth({ now: new Date('2026-07-06T12:00:00.000Z') });

    expect(health.assets[0].status).toBe('stale');
    expect(health.status).toBe('warning');
  });

  it('detects missing prices', async () => {
    await seedHolding();
    const { getPriceHealth } = await import('../src/lib/server/analytics/history-health');

    const health = await getPriceHealth({ now: new Date('2026-07-06T12:00:00.000Z') });

    expect(health.assets[0].status).toBe('missing');
    expect(health.status).toBe('broken');
  });

  it('detects failed price events', async () => {
    await seedHolding();
    await insertPrice('2026-07-06T11:45:00.000Z');
    const { recordPriceUpdateEvent } = await import('../src/lib/server/prices/events');
    recordPriceUpdateEvent({
      assetId: 'coingecko:bitcoin',
      provider: 'test',
      fiatCurrency: 'EUR',
      status: 'failed',
      errorMessage: 'provider failed',
      checkedAt: '2026-07-06T11:50:00.000Z'
    });
    const { getPriceHealth } = await import('../src/lib/server/analytics/history-health');

    const health = await getPriceHealth({ now: new Date('2026-07-06T12:00:00.000Z') });

    expect(health.assets[0].status).toBe('failed');
    expect(health.status).toBe('broken');
  });
});
