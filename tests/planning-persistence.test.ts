import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function resetDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-planning-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.BASE_CURRENCY = 'EUR';
  process.env.PRICE_PROVIDER = 'coingecko';
}

function planInput(providerCoinId = 'bitcoin', symbol = 'BTC', percentage = '100') {
  return {
    name: 'Primary plan',
    targetValue: '1000',
    currency: 'EUR' as const,
    targetDate: null,
    targets: [
      {
        asset: {
          provider: 'coingecko',
          providerCoinId,
          symbol,
          name: symbol === 'BTC' ? 'Bitcoin' : 'Ethereum',
          imageUrl: null
        },
        targetPercentage: percentage
      }
    ]
  };
}

describe('portfolio plan persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    resetDatabase();
  });

  it('keeps one plan and atomically replaces its targets', async () => {
    const { savePortfolioPlan, getSavedPortfolioPlan } =
      await import('../src/lib/server/planning/service');
    const { db } = await import('../src/lib/server/db/client');
    const { portfolioAllocationTargets, portfolioPlans } =
      await import('../src/lib/server/db/schema');

    const first = savePortfolioPlan(planInput());
    savePortfolioPlan(planInput('ethereum', 'ETH'));
    const saved = getSavedPortfolioPlan();

    expect(db.select().from(portfolioPlans).all()).toHaveLength(1);
    expect(db.select().from(portfolioAllocationTargets).all()).toHaveLength(1);
    expect(saved?.targets.map((row) => row.symbol)).toEqual(['ETH']);
    expect(saved?.createdAt).toBe(first.createdAt);
  });

  it('leaves the previous plan intact when replacement validation fails', async () => {
    const { savePortfolioPlan, getSavedPortfolioPlan } =
      await import('../src/lib/server/planning/service');
    savePortfolioPlan(planInput());

    expect(() => savePortfolioPlan(planInput('ethereum', 'ETH', '99'))).toThrow('exactly 100%');
    expect(getSavedPortfolioPlan()?.targets.map((row) => row.symbol)).toEqual(['BTC']);
  });

  it('clears only planning records', async () => {
    const { savePortfolioPlan, clearPortfolioPlan, getSavedPortfolioPlan } =
      await import('../src/lib/server/planning/service');
    const { createTransaction } = await import('../src/lib/server/transactions');
    const { db } = await import('../src/lib/server/db/client');
    const { assets, portfolioAllocationTargets, transactions } =
      await import('../src/lib/server/db/schema');
    await createTransaction({
      asset: planInput().targets[0].asset,
      type: 'buy',
      quantity: '1',
      fiatAmount: '100',
      fiatCurrency: 'EUR',
      feeAmount: '0',
      feeCurrency: 'EUR',
      transactionDate: '2026-01-01T12:00:00.000Z'
    });
    savePortfolioPlan(planInput());

    clearPortfolioPlan();

    expect(getSavedPortfolioPlan()).toBeNull();
    expect(db.select().from(portfolioAllocationTargets).all()).toHaveLength(0);
    expect(db.select().from(transactions).all()).toHaveLength(1);
    expect(db.select().from(assets).all()).toHaveLength(1);
  });
});

describe('base-currency plan conversion', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    resetDatabase();
  });

  it('converts the target and settings together with a cached public FX rate', async () => {
    const { savePortfolioPlan, getSavedPortfolioPlan } =
      await import('../src/lib/server/planning/service');
    const { db } = await import('../src/lib/server/db/client');
    const { fxRates } = await import('../src/lib/server/db/schema');
    const { actions } = await import('../src/routes/settings/+page.server');
    savePortfolioPlan(planInput());
    const today = new Date().toISOString().slice(0, 10);
    db.insert(fxRates)
      .values({
        id: crypto.randomUUID(),
        rateDate: today,
        baseCurrency: 'EUR',
        quoteCurrency: 'USD',
        provider: 'frankfurter',
        rate: '1.25',
        capturedAt: new Date().toISOString()
      })
      .run();

    const result = await actions.update({
      request: new Request('http://app/settings?/update', {
        method: 'POST',
        body: new URLSearchParams({ base_currency: 'USD', price_provider: 'coingecko' })
      })
    } as never);
    const { getAppSettings } = await import('../src/lib/server/settings');

    expect(result).toEqual({ success: true });
    expect(getAppSettings().baseCurrency).toBe('USD');
    expect(getSavedPortfolioPlan()).toMatchObject({ currency: 'USD', targetValue: '1250' });
  });

  it('does not partially change settings or the plan when current FX is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('FX provider unavailable');
      })
    );
    const { savePortfolioPlan, getSavedPortfolioPlan } =
      await import('../src/lib/server/planning/service');
    const { createTransaction } = await import('../src/lib/server/transactions');
    const { db } = await import('../src/lib/server/db/client');
    const { assetLots, fxRates } = await import('../src/lib/server/db/schema');
    const { getAppSettings } = await import('../src/lib/server/settings');
    const { actions } = await import('../src/routes/settings/+page.server');
    await createTransaction({
      asset: planInput().targets[0].asset,
      type: 'buy',
      quantity: '1',
      fiatAmount: '100',
      fiatCurrency: 'EUR',
      feeAmount: '0',
      feeCurrency: 'EUR',
      transactionDate: '2026-01-01T12:00:00.000Z'
    });
    db.insert(fxRates)
      .values({
        id: crypto.randomUUID(),
        rateDate: '2026-01-01',
        baseCurrency: 'EUR',
        quoteCurrency: 'USD',
        provider: 'frankfurter',
        rate: '1.2',
        capturedAt: '2026-01-02T00:00:00.000Z'
      })
      .run();
    savePortfolioPlan(planInput());
    const accountingBefore = db.select().from(assetLots).all();

    const result = await actions.update({
      request: new Request('http://app/settings?/update', {
        method: 'POST',
        body: new URLSearchParams({ base_currency: 'USD', price_provider: 'coingecko' })
      })
    } as never);

    expect(result && 'status' in result ? result.status : null).toBe(400);
    expect(getAppSettings().baseCurrency).toBe('EUR');
    expect(getSavedPortfolioPlan()).toMatchObject({ currency: 'EUR', targetValue: '1000' });
    expect(db.select().from(assetLots).all()).toEqual(accountingBefore);
  });
});
