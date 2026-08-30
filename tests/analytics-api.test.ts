import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function resetDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-analytics-api-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.BASE_CURRENCY = 'EUR';
  process.env.PRICE_PROVIDER = 'coingecko';
  process.env.PRICE_CACHE_TTL_SECONDS = '600';
  process.env.INTERNAL_CRON_SECRET = 'test-secret';
}

async function seedPortfolio(price: string) {
  const { createTransaction } = await import('../src/lib/server/transactions');
  const { db } = await import('../src/lib/server/db/client');
  const { priceSnapshots } = await import('../src/lib/server/db/schema');
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
    transactionDate: '2025-01-01T12:00:00.000Z'
  });
  db.insert(priceSnapshots)
    .values({
      id: randomUUID(),
      assetId: 'coingecko:bitcoin',
      fiatCurrency: 'EUR',
      price,
      source: 'test',
      capturedAt: new Date().toISOString()
    })
    .run();

  const { getPortfolioOverviewContext } = await import('../src/lib/server/portfolio/service');
  return getPortfolioOverviewContext();
}

async function insertSnapshot(input: {
  snapshotType: 'hourly' | 'daily';
  bucketAt: string;
  capturedAt: string;
  totalValue: string;
  holdingsJson: string;
}) {
  const { db } = await import('../src/lib/server/db/client');
  const { portfolioSnapshots } = await import('../src/lib/server/db/schema');
  db.insert(portfolioSnapshots)
    .values({
      id: randomUUID(),
      snapshotType: input.snapshotType,
      baseCurrency: 'EUR',
      bucketAt: input.bucketAt,
      totalValue: input.totalValue,
      openCostBasis: '100',
      unrealizedProfit: '0',
      roiPercent: '0',
      holdingsJson: input.holdingsJson,
      pricesJson: '[]',
      priceStatus: 'fresh',
      capturedAt: input.capturedAt,
      createdAt: input.capturedAt
    })
    .run();
}

describe('analytics API', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDatabase();
  });

  it('rejects invalid ranges', async () => {
    const { GET } = await import('../src/routes/api/analytics/performance/+server');

    const response = await GET({
      url: new URL('http://app/api/analytics/performance?range=forever')
    } as never);

    expect(response.status).toBe(400);
  });

  it('returns a safe empty summary', async () => {
    const { GET } = await import('../src/routes/api/analytics/summary/+server');

    const response = await GET();
    const payload = (await response.json()) as { currentValue: string; messages: string[] };

    expect(response.status).toBe(200);
    expect(payload.currentValue).toBe('0');
    expect(payload.messages[0]).toBe('No portfolio snapshots exist yet.');
  });

  it('closes time-weighted return with the current complete valuation', async () => {
    const { overview, normalizedTransactions } = await seedPortfolio('110');
    await insertSnapshot({
      snapshotType: 'daily',
      bucketAt: '2026-08-29T00:00:00.000Z',
      capturedAt: '2026-08-29T00:05:00.000Z',
      totalValue: '100',
      holdingsJson: JSON.stringify(overview.holdings)
    });
    const { getAnalyticsSummary } = await import('../src/lib/server/analytics/service');

    const summary = await getAnalyticsSummary({
      now: new Date('2026-08-30T12:00:00.000Z'),
      overview,
      normalizedTransactions
    });

    expect(summary.timeWeightedReturnPercent).toBe('10');
  });

  it('orders mixed snapshot cadences by capture time for ATH and drawdown', async () => {
    const { overview, normalizedTransactions } = await seedPortfolio('200');
    const holdingsJson = JSON.stringify(overview.holdings);
    await insertSnapshot({
      snapshotType: 'daily',
      bucketAt: '2026-08-28T00:00:00.000Z',
      capturedAt: '2026-08-29T12:00:00.000Z',
      totalValue: '200',
      holdingsJson
    });
    await insertSnapshot({
      snapshotType: 'hourly',
      bucketAt: '2026-08-29T00:00:00.000Z',
      capturedAt: '2026-08-29T00:05:00.000Z',
      totalValue: '150',
      holdingsJson
    });
    const { getAnalyticsSummary } = await import('../src/lib/server/analytics/service');

    const summary = await getAnalyticsSummary({
      now: new Date('2026-08-30T12:00:00.000Z'),
      overview,
      normalizedTransactions
    });

    expect(summary.allTimeHighValue).toBe('200');
    expect(summary.allTimeHighAt).toBe('2026-08-29T12:00:00.000Z');
    expect(summary.maxDrawdownPercent).toBe('0');
  });

  it('explains when a historical snapshot has no usable ledger', async () => {
    const { overview, normalizedTransactions } = await seedPortfolio('110');
    await insertSnapshot({
      snapshotType: 'daily',
      bucketAt: '2026-08-29T00:00:00.000Z',
      capturedAt: '2026-08-29T00:05:00.000Z',
      totalValue: '100',
      holdingsJson: '[]'
    });
    const { getAnalyticsSummary } = await import('../src/lib/server/analytics/service');

    const summary = await getAnalyticsSummary({
      now: new Date('2026-08-30T12:00:00.000Z'),
      overview,
      normalizedTransactions
    });

    expect(summary.timeWeightedReturnPercent).toBeNull();
    expect(summary.messages).toContain(
      'Time-weighted return is unavailable because a snapshot has no usable transaction ledger.'
    );
  });

  it('rejects the internal health endpoint without a secret', async () => {
    const { POST } = await import('../src/routes/api/internal/analytics/health-check/+server');
    delete process.env.INTERNAL_CRON_SECRET;

    const response = await POST({
      request: new Request('http://app/api/internal/analytics/health-check', { method: 'POST' })
    } as never);

    expect(response.status).toBe(401);
  });

  it('rejects the internal health endpoint with the wrong secret', async () => {
    const { POST } = await import('../src/routes/api/internal/analytics/health-check/+server');

    const response = await POST({
      request: new Request('http://app/api/internal/analytics/health-check', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret' }
      })
    } as never);

    expect(response.status).toBe(401);
  });

  it('accepts the internal health endpoint with a valid secret', async () => {
    const { POST } = await import('../src/routes/api/internal/analytics/health-check/+server');

    const response = await POST({
      request: new Request('http://app/api/internal/analytics/health-check', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' }
      })
    } as never);
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
  });
});
