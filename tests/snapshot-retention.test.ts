import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = new Date('2026-08-30T12:00:00.000Z');
const dayMs = 24 * 60 * 60 * 1000;

function atDaysAgo(days: number): string {
  return new Date(now.getTime() - days * dayMs).toISOString();
}

async function insertSnapshot(
  snapshotType: 'hourly' | 'daily',
  bucketAt: string,
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
      openCostBasis: '80',
      unrealizedProfit: '20',
      roiPercent: '25',
      holdingsJson: '[]',
      pricesJson: '[]',
      priceStatus,
      capturedAt: bucketAt,
      createdAt: bucketAt
    })
    .run();
}

describe('portfolio snapshot retention', () => {
  beforeEach(() => {
    vi.resetModules();
    const directory = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-retention-'));
    process.env.DATABASE_PATH = path.join(directory, 'test.db');
    process.env.BASE_CURRENCY = 'EUR';
    process.env.PRICE_PROVIDER = 'coingecko';
    process.env.INTERNAL_CRON_SECRET = 'test-secret';
  });

  it('deletes hourly rows before the boundary and never deletes daily rows', async () => {
    await insertSnapshot('hourly', atDaysAgo(91));
    await insertSnapshot('hourly', atDaysAgo(90));
    await insertSnapshot('hourly', atDaysAgo(1));
    await insertSnapshot('daily', atDaysAgo(500));
    const { cleanupPortfolioSnapshots } = await import('../src/lib/server/portfolio/snapshots');

    const result = cleanupPortfolioSnapshots({ now, hourlyRetentionDays: 90 });
    expect(result.hourlyDeleted).toBe(1);
    expect(result.hourlyRetained).toBe(2);
    expect(result.dailyRetained).toBe(1);
    expect(result.cutoffAt).toBe(atDaysAgo(90));
  });

  it('preserves the latest usable hourly history even when every hourly row is old', async () => {
    await insertSnapshot('hourly', atDaysAgo(120));
    await insertSnapshot('hourly', atDaysAgo(110), 'stale');
    await insertSnapshot('hourly', atDaysAgo(100), 'failed');
    const { cleanupPortfolioSnapshots } = await import('../src/lib/server/portfolio/snapshots');
    const { db } = await import('../src/lib/server/db/client');
    const { portfolioSnapshots } = await import('../src/lib/server/db/schema');

    const first = cleanupPortfolioSnapshots({ now, hourlyRetentionDays: 90 });
    const second = cleanupPortfolioSnapshots({ now, hourlyRetentionDays: 90 });
    const rows = db.select().from(portfolioSnapshots).all();

    expect(first.hourlyDeleted).toBe(2);
    expect(second.hourlyDeleted).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].bucketAt).toBe(atDaysAgo(110));
  });

  it('returns snapshot cleanup counts from the authenticated health workflow', async () => {
    await insertSnapshot('hourly', atDaysAgo(91));
    await insertSnapshot('hourly', atDaysAgo(1));
    await insertSnapshot('daily', atDaysAgo(91));
    const { POST } = await import('../src/routes/api/internal/analytics/health-check/+server');

    const response = await POST({
      request: new Request('http://app/api/internal/analytics/health-check', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' }
      })
    } as never);
    const payload = (await response.json()) as {
      cleanup: {
        portfolioSnapshots: { hourlyDeleted: number; dailyRetained: number };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.cleanup.portfolioSnapshots.hourlyDeleted).toBe(1);
    expect(payload.cleanup.portfolioSnapshots.dailyRetained).toBe(1);
  });
});
