import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function resetDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-explain-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.BASE_CURRENCY = 'EUR';
  process.env.PRICE_PROVIDER = 'coingecko';
  process.env.PRICE_CACHE_TTL_SECONDS = '600';
  process.env.INTERNAL_CRON_SECRET = 'test-secret';
}

async function insertSnapshot(bucketAt: string, value: string) {
  const { db } = await import('../src/lib/server/db/client');
  const { portfolioSnapshots } = await import('../src/lib/server/db/schema');

  db.insert(portfolioSnapshots)
    .values({
      id: randomUUID(),
      snapshotType: 'hourly',
      baseCurrency: 'EUR',
      bucketAt,
      totalValue: value,
      totalInvested: '100',
      unrealizedProfit: '0',
      roiPercent: '0',
      holdingsJson: '[]',
      pricesJson: '[]',
      priceStatus: 'fresh',
      capturedAt: bucketAt,
      createdAt: bucketAt
    })
    .run();
}

async function seedTransaction() {
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
    transactionDate: '2026-07-06T11:00:00.000Z'
  });
}

describe('deterministic explain mode', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDatabase();
  });

  it('summarizes portfolio movement up over a range', async () => {
    await insertSnapshot('2026-07-06T10:00:00.000Z', '100');
    await insertSnapshot('2026-07-06T11:00:00.000Z', '150');
    const { explainPortfolioMove } = await import('../src/lib/server/insights/explain');

    const explanation = await explainPortfolioMove('24h', {
      now: new Date('2026-07-06T12:00:00.000Z')
    });

    expect(explanation.summary).toContain('up');
    expect(explanation.summary).toContain('€50.00');
  });

  it('sorts transaction drivers into asset drivers', async () => {
    await seedTransaction();
    const { explainAssetDrivers } = await import('../src/lib/server/insights/explain');

    const explanation = await explainAssetDrivers('24h', {
      now: new Date('2026-07-06T12:00:00.000Z')
    });

    expect(explanation.drivers.some((driver) => driver.asset === 'BTC')).toBe(true);
    expect(explanation.drivers.some((driver) => driver.reason === 'transaction')).toBe(true);
  });

  it('includes custom cycle context without advice', async () => {
    const { explainCycleContext } = await import('../src/lib/server/insights/explain');

    const explanation = await explainCycleContext({ now: new Date('2026-10-06T12:00:00.000Z') });

    expect(explanation.summary).toContain('Bull');
    expect(explanation.summary).toContain('2029-09-03');
    expect(explanation.warnings[0]).toContain('not a prediction');
  });

  it('surfaces data health warnings deterministically', async () => {
    const { explainDataHealth } = await import('../src/lib/server/insights/explain');

    const explanation = await explainDataHealth({ now: new Date('2026-07-06T12:00:00.000Z') });

    expect(explanation.summary).toContain('Data confidence');
    expect(explanation.warnings.join(' ')).toContain('No hourly snapshots');
  });
});
