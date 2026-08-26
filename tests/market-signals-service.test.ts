import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderDailyMarketPoint } from '$lib/server/prices/provider';

function resetDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-signals-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.BASE_CURRENCY = 'EUR';
  process.env.PRICE_PROVIDER = 'coingecko';
  process.env.INTERNAL_CRON_SECRET = 'signal-test-secret';
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function planInput() {
  return {
    name: 'Signal plan',
    targetValue: '1000',
    currency: 'EUR' as const,
    targetDate: null,
    targets: [
      ['bitcoin', 'BTC', 'Bitcoin', '33.333333333333333333'],
      ['ethereum', 'ETH', 'Ethereum', '33.333333333333333333'],
      ['solana', 'SOL', 'Solana', '33.333333333333333334']
    ].map(([providerCoinId, symbol, name, targetPercentage]) => ({
      asset: { provider: 'coingecko', providerCoinId, symbol, name, imageUrl: null },
      targetPercentage
    }))
  };
}

describe('market history normalization and providers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    resetDatabase();
  });

  it('normalizes UTC days, excludes today, deduplicates, and retains at most 400 days', async () => {
    const { normalizeDailyMarketHistory } = await import('../src/lib/server/signals/refresh');
    const now = new Date('2026-08-26T12:00:00.000Z');
    const points: ProviderDailyMarketPoint[] = Array.from({ length: 402 }, (_, index) => ({
      timestamp: new Date(Date.UTC(2025, 7, 20 + index, 12)).toISOString(),
      close: String(index + 1),
      volume: String(index * 10)
    }));
    points.push(
      { timestamp: '2026-08-25T01:00:00.000Z', close: '50', volume: '1' },
      { timestamp: '2026-08-25T23:00:00.000Z', close: '75', volume: '2' },
      { timestamp: '2026-08-26T01:00:00.000Z', close: '999', volume: '3' },
      { timestamp: 'invalid', close: '3', volume: null },
      { timestamp: '2026-08-24T20:00:00.000Z', close: '-1', volume: null }
    );

    const normalized = normalizeDailyMarketHistory(points, now);
    expect(normalized.length).toBeLessThanOrEqual(400);
    expect(normalized.some((point) => point.day === '2026-08-26')).toBe(false);
    expect(normalized.find((point) => point.day === '2026-08-25')).toMatchObject({
      close: '75',
      volume: '2'
    });
    expect(new Set(normalized.map((point) => point.day)).size).toBe(normalized.length);
  });

  it('rejects malformed CoinGecko market-chart payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ prices: [['bad', 100]] }))
    );
    const { coingeckoProvider } = await import('../src/lib/server/prices/coingecko');
    await expect(coingeckoProvider.getDailyMarketHistory('bitcoin', 'EUR', 365)).rejects.toThrow();
  });
});

describe('market signal cache and refresh workflow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    resetDatabase();
  });

  it('stores completed daily history and uses the latest point for duplicate UTC days', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          prices: [
            [Date.parse('2026-08-24T20:00:00.000Z'), 100],
            [Date.parse('2026-08-25T01:00:00.000Z'), 90],
            [Date.parse('2026-08-25T23:00:00.000Z'), 80],
            [Date.parse('2026-08-26T01:00:00.000Z'), 70]
          ],
          total_volumes: []
        })
      )
    );
    const { db } = await import('../src/lib/server/db/client');
    const { assets, marketDailyPoints, marketSignalRefreshState } =
      await import('../src/lib/server/db/schema');
    const asset = {
      id: 'coingecko:bitcoin',
      provider: 'coingecko',
      providerCoinId: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      imageUrl: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
    db.insert(assets).values(asset).run();
    const { refreshAssetMarketHistory } = await import('../src/lib/server/signals/refresh');

    const result = await refreshAssetMarketHistory(
      asset,
      'EUR',
      new Date('2026-08-26T12:00:00.000Z')
    );
    const rows = db.select().from(marketDailyPoints).all();
    const state = db.select().from(marketSignalRefreshState).get();

    expect(result).toMatchObject({ points: 2, latestDay: '2026-08-25' });
    expect(rows.find((row) => row.day === '2026-08-25')?.close).toBe('80');
    expect(state).toMatchObject({ lastError: null, lastSuccessAt: '2026-08-26T12:00:00.000Z' });
  });

  it('retains prior data and records a retryable rate-limit failure', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'rate limit' }, 429));
    vi.stubGlobal('fetch', fetchMock);
    const { db } = await import('../src/lib/server/db/client');
    const { assets, marketDailyPoints, marketSignalRefreshState } =
      await import('../src/lib/server/db/schema');
    const asset = {
      id: 'coingecko:bitcoin',
      provider: 'coingecko',
      providerCoinId: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      imageUrl: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
    db.insert(assets).values(asset).run();
    db.insert(marketDailyPoints)
      .values({
        id: 'old',
        assetId: asset.id,
        baseCurrency: 'EUR',
        day: '2026-08-24',
        close: '100',
        volume: null,
        source: 'coingecko',
        capturedAt: '2026-08-25T00:00:00.000Z'
      })
      .run();
    db.insert(marketSignalRefreshState)
      .values({
        id: `${asset.id}:EUR`,
        assetId: asset.id,
        baseCurrency: 'EUR',
        lastAttemptAt: '2026-08-25T00:00:00.000Z',
        lastSuccessAt: '2026-08-25T00:00:00.000Z',
        lastError: null,
        updatedAt: '2026-08-25T00:00:00.000Z'
      })
      .run();
    const { refreshAssetMarketHistory } = await import('../src/lib/server/signals/refresh');

    await expect(
      refreshAssetMarketHistory(asset, 'EUR', new Date('2026-08-26T12:00:00.000Z'))
    ).rejects.toThrow('429');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(db.select().from(marketDailyPoints).all()).toHaveLength(1);
    expect(db.select().from(marketSignalRefreshState).get()).toMatchObject({
      lastSuccessAt: '2026-08-25T00:00:00.000Z',
      lastError: expect.stringContaining('429')
    });

    const { savePortfolioPlan, getPortfolioPlanning } =
      await import('../src/lib/server/planning/service');
    savePortfolioPlan({
      name: 'Failure fallback',
      targetValue: '1000',
      currency: 'EUR',
      targetDate: null,
      targets: [
        {
          asset: {
            provider: 'coingecko',
            providerCoinId: 'bitcoin',
            symbol: 'BTC',
            name: 'Bitcoin',
            imageUrl: null
          },
          targetPercentage: '100'
        }
      ]
    });
    const planning = await getPortfolioPlanning(undefined, new Date('2026-08-26T12:00:00.000Z'));
    const { getPlannedAssetMarketSignals } = await import('../src/lib/server/signals/service');
    const assessment = getPlannedAssetMarketSignals(planning, new Date('2026-08-26T12:00:00.000Z'))
      .assessments[0];
    expect(assessment.reasons.join(' ')).toContain('Latest market-history refresh failed');
    expect(
      assessment.signals
        .filter((signal) => signal.key !== 'fear_greed')
        .every((signal) => !signal.fresh)
    ).toBe(true);
  });

  it('persists global threshold edits and enforces the singleton', async () => {
    const { getMarketSignalSettings, updateMarketSignalSettings } =
      await import('../src/lib/server/signals/settings');
    const updated = updateMarketSignalSettings({
      fearGreedMax: '20',
      rsi14Max: '28',
      sma200DeviationMax: '-12.5',
      drawdown365Max: '-35',
      bollingerZMax: '-2',
      requiredFavorableCount: 5
    });
    expect(updated).toMatchObject({ fearGreedMax: '20', requiredFavorableCount: 5 });
    expect(getMarketSignalSettings()).toMatchObject({
      sma200DeviationMax: '-12.5',
      bollingerZMax: '-2'
    });
  });

  it('processes only two stale planned assets per batch', async () => {
    const sentimentTimestamp = Math.floor(Date.parse('2026-08-25T00:00:00.000Z') / 1000);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('alternative.me')) {
        return jsonResponse({
          data: [
            {
              value: '20',
              value_classification: 'Extreme Fear',
              timestamp: String(sentimentTimestamp)
            }
          ]
        });
      }
      return jsonResponse({
        prices: [[Date.parse('2026-08-25T23:00:00.000Z'), 100]],
        total_volumes: []
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { savePortfolioPlan } = await import('../src/lib/server/planning/service');
    savePortfolioPlan(planInput());
    const { refreshPlannedMarketSignals } = await import('../src/lib/server/signals/refresh');
    const result = await refreshPlannedMarketSignals({
      limit: 2,
      now: new Date('2026-08-26T12:00:00.000Z')
    });
    const { db } = await import('../src/lib/server/db/client');
    const { marketSignalRefreshState } = await import('../src/lib/server/db/schema');

    expect(result).toMatchObject({ requested: 2, refreshed: 2, failed: 0, sentiment: 'refreshed' });
    expect(db.select().from(marketSignalRefreshState).all()).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    db.insert(marketSignalRefreshState)
      .values({
        id: 'coingecko:solana:EUR',
        assetId: 'coingecko:solana',
        baseCurrency: 'EUR',
        lastAttemptAt: '2026-08-26T12:00:00.000Z',
        lastSuccessAt: null,
        lastError: 'rate limited',
        updatedAt: '2026-08-26T12:00:00.000Z'
      })
      .run();
    const cooldown = await refreshPlannedMarketSignals({
      limit: 2,
      now: new Date('2026-08-26T12:10:00.000Z')
    });
    const retry = await refreshPlannedMarketSignals({
      limit: 2,
      now: new Date('2026-08-26T12:31:00.000Z')
    });
    expect(cooldown.requested).toBe(0);
    expect(retry).toMatchObject({ requested: 1, refreshed: 1 });
  });

  it('keeps old-currency history pending after a base-currency change', async () => {
    const { savePortfolioPlan, getPortfolioPlanning } =
      await import('../src/lib/server/planning/service');
    const input = planInput();
    input.targets = [
      {
        asset: input.targets[0].asset,
        targetPercentage: '100'
      }
    ];
    savePortfolioPlan(input);
    const { db } = await import('../src/lib/server/db/client');
    const { marketDailyPoints, marketSignalRefreshState, portfolioPlans } =
      await import('../src/lib/server/db/schema');
    db.insert(marketDailyPoints)
      .values({
        id: 'eur-history',
        assetId: 'coingecko:bitcoin',
        baseCurrency: 'EUR',
        day: '2026-08-25',
        close: '100',
        volume: null,
        source: 'coingecko',
        capturedAt: '2026-08-26T06:00:00.000Z'
      })
      .run();
    db.insert(marketSignalRefreshState)
      .values({
        id: 'coingecko:bitcoin:EUR',
        assetId: 'coingecko:bitcoin',
        baseCurrency: 'EUR',
        lastAttemptAt: '2026-08-26T06:00:00.000Z',
        lastSuccessAt: '2026-08-26T06:00:00.000Z',
        lastError: null,
        updatedAt: '2026-08-26T06:00:00.000Z'
      })
      .run();
    db.update(portfolioPlans).set({ currency: 'USD' }).run();
    const planning = await getPortfolioPlanning(undefined, new Date('2026-08-26T12:00:00.000Z'));
    const { getPlannedAssetMarketSignals } = await import('../src/lib/server/signals/service');
    const signals = getPlannedAssetMarketSignals(planning, new Date('2026-08-26T12:00:00.000Z'));

    expect(signals.baseCurrency).toBe('USD');
    expect(signals.assessments[0].historyAsOf).toBeNull();
    expect(signals.health.pendingAssetCount).toBe(1);
  });

  it('requires internal authentication and never exposes a public signal API', async () => {
    const { POST } = await import('../src/routes/api/internal/signals/refresh/+server');
    const response = await POST({
      request: new Request('http://app/api/internal/signals/refresh', { method: 'POST' })
    } as never);
    expect(response.status).toBe(401);
  });
});
