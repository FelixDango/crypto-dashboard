import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function resetDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-snapshots-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.BASE_CURRENCY = 'EUR';
  process.env.PRICE_PROVIDER = 'coingecko';
  process.env.PRICE_CACHE_TTL_SECONDS = '600';
  process.env.INTERNAL_CRON_SECRET = 'test-secret';
}

async function seedHolding(priceCapturedAt = new Date().toISOString(), price = '200') {
  const { createTransaction } = await import('../src/lib/server/transactions');
  const { db } = await import('../src/lib/server/db/client');
  const { priceSnapshots } = await import('../src/lib/server/db/schema');

  createTransaction({
    asset: {
      provider: 'coingecko',
      providerCoinId: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin'
    },
    type: 'buy',
    quantity: '2',
    fiatAmount: '300',
    fiatCurrency: 'EUR',
    feeAmount: '0',
    feeCurrency: 'EUR',
    transactionDate: '2026-01-01T12:00:00.000Z'
  });

  db.insert(priceSnapshots)
    .values({
      id: randomUUID(),
      assetId: 'coingecko:bitcoin',
      fiatCurrency: 'EUR',
      price,
      source: 'test',
      capturedAt: priceCapturedAt
    })
    .run();
}

describe('portfolio snapshots', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    resetDatabase();
  });

  it('normalizes hourly buckets to the UTC hour', async () => {
    const { normalizeSnapshotBucket } = await import('../src/lib/server/portfolio/snapshots');

    expect(normalizeSnapshotBucket('hourly', new Date('2026-07-05T12:34:56.789Z'))).toBe(
      '2026-07-05T12:00:00.000Z'
    );
  });

  it('normalizes daily buckets to the UTC day', async () => {
    const { normalizeSnapshotBucket } = await import('../src/lib/server/portfolio/snapshots');

    expect(normalizeSnapshotBucket('daily', new Date('2026-07-05T23:55:00.000Z'))).toBe(
      '2026-07-05T00:00:00.000Z'
    );
  });

  it('prevents duplicate snapshots in the same bucket', async () => {
    await seedHolding();
    const { createPortfolioSnapshot } = await import('../src/lib/server/portfolio/snapshots');
    const { db } = await import('../src/lib/server/db/client');
    const { portfolioSnapshots } = await import('../src/lib/server/db/schema');

    const first = await createPortfolioSnapshot('hourly', {
      now: new Date('2026-07-05T12:34:00.000Z')
    });
    const second = await createPortfolioSnapshot('hourly', {
      now: new Date('2026-07-05T12:55:00.000Z')
    });

    expect(first.result).toBe('created');
    expect(second.result).toBe('already_exists');
    expect(db.select().from(portfolioSnapshots).all()).toHaveLength(1);
  });

  it('stores calculated portfolio totals and snapshot payloads', async () => {
    await seedHolding();
    const { createPortfolioSnapshot } = await import('../src/lib/server/portfolio/snapshots');

    const result = await createPortfolioSnapshot('hourly', {
      now: new Date('2026-07-05T12:34:00.000Z')
    });

    expect(result.snapshot.totalValue).toBe('400');
    expect(result.snapshot.totalInvested).toBe('300');
    expect(result.snapshot.unrealizedProfit).toBe('100');
    expect(new Decimal(result.snapshot.roiPercent).toFixed(2)).toBe('33.33');
    expect(result.snapshot.priceStatus).toBe('fresh');
    expect(JSON.parse(result.snapshot.holdingsJson)).toHaveLength(1);
    expect(JSON.parse(result.snapshot.pricesJson)).toHaveLength(1);
  });

  it('falls back to stale cached prices when the live provider fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('provider unavailable');
      })
    );
    await seedHolding(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), '123');
    const { createPortfolioSnapshot } = await import('../src/lib/server/portfolio/snapshots');

    const result = await createPortfolioSnapshot('hourly', {
      now: new Date('2026-07-05T12:34:00.000Z')
    });
    const prices = JSON.parse(result.snapshot.pricesJson) as Array<{ stale: boolean }>;

    expect(result.snapshot.totalValue).toBe('246');
    expect(result.snapshot.priceStatus).toBe('stale');
    expect(prices[0].stale).toBe(true);
  });

  it('rejects missing and invalid internal cron secrets without creating snapshots', async () => {
    const { POST } = await import('../src/routes/api/internal/snapshots/hourly/+server');
    const { db } = await import('../src/lib/server/db/client');
    const { portfolioSnapshots } = await import('../src/lib/server/db/schema');

    delete process.env.INTERNAL_CRON_SECRET;
    const missing = await POST({
      request: new Request('http://app/api/internal/snapshots/hourly', { method: 'POST' })
    } as never);

    process.env.INTERNAL_CRON_SECRET = 'test-secret';
    const invalid = await POST({
      request: new Request('http://app/api/internal/snapshots/hourly', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret' }
      })
    } as never);

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(db.select().from(portfolioSnapshots).all()).toHaveLength(0);
  });

  it('accepts a valid internal cron secret', async () => {
    await seedHolding();
    const { POST } = await import('../src/routes/api/internal/snapshots/hourly/+server');
    const { db } = await import('../src/lib/server/db/client');
    const { portfolioSnapshots } = await import('../src/lib/server/db/schema');

    const response = await POST({
      request: new Request('http://app/api/internal/snapshots/hourly', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' }
      })
    } as never);
    const payload = (await response.json()) as {
      result: string;
      snapshotType: string;
      bucket: string;
    };

    expect(response.status).toBe(200);
    expect(payload.result).toBe('created');
    expect(payload.snapshotType).toBe('hourly');
    expect(payload.bucket).toMatch(/T\d{2}:00:00\.000Z$/);
    expect(db.select().from(portfolioSnapshots).all()).toHaveLength(1);
  });
});
