import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculatePortfolio } from '$lib/portfolio/calculations';
import { createTransactionInputSchema } from '$lib/validation/transaction';
import type { TransactionRecord } from '$lib/types';
import type { TransactionInput } from '$lib/server/transactions';

const timestamp = '2026-08-01T12:00:00.000Z';

function record(id: string, type: 'buy' | 'sell', quantity: string, fiatAmount: string) {
  return {
    id,
    assetId: 'coingecko:bitcoin',
    assetSymbol: 'BTC',
    assetName: 'Bitcoin',
    type,
    quantity,
    fiatAmount,
    fiatCurrency: 'EUR',
    feeAmount: null,
    feeCurrency: null,
    importBatchId: null,
    rowHash: null,
    transactionDate: timestamp,
    notes: null,
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies TransactionRecord;
}

const validInput = {
  asset: {
    provider: 'coingecko',
    providerCoinId: 'bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    imageUrl: ''
  },
  type: 'buy',
  quantity: '1',
  fiatAmount: '100',
  fiatCurrency: 'EUR',
  feeAmount: null,
  feeCurrency: 'EUR',
  transactionDate: '2026-08-30',
  notes: ''
} satisfies TransactionInput;

describe('transaction hardening', () => {
  beforeEach(() => {
    vi.resetModules();
    const directory = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-hardening-'));
    process.env.DATABASE_PATH = path.join(directory, 'test.db');
    process.env.BASE_CURRENCY = 'EUR';
    process.env.PRICE_PROVIDER = 'coingecko';
  });

  it('uses id as the final deterministic tie-breaker for holdings, cost basis, P/L, and ROI', () => {
    const canonical = [
      record('a-buy', 'buy', '1', '100'),
      record('b-buy', 'buy', '1', '300'),
      record('c-sell', 'sell', '1', '250')
    ];
    const quote = {
      assetId: 'coingecko:bitcoin',
      price: '300',
      currency: 'EUR' as const,
      source: 'test',
      capturedAt: timestamp,
      stale: false
    };

    const expected = calculatePortfolio(canonical, [quote], 'EUR');
    for (const input of [
      canonical,
      [...canonical].reverse(),
      [canonical[2], canonical[0], canonical[1]]
    ]) {
      const result = calculatePortfolio(input, [quote], 'EUR');
      expect(result.holdings).toEqual(expected.holdings);
      expect(result.totals).toEqual(expected.totals);
    }

    expect(expected.holdings[0].quantity).toBe('1');
    expect(expected.holdings[0].costBasis).toBe('200');
    expect(expected.holdings[0].realizedProfit).toBe('50');
    expect(expected.totals.roiPercent).toBe('37.5');
  });

  it('allows today and rejects a later UTC calendar date', () => {
    const now = new Date('2026-08-30T23:59:59.000Z');
    expect(createTransactionInputSchema(now).safeParse(validInput).success).toBe(true);
    const future = createTransactionInputSchema(now).safeParse({
      ...validInput,
      transactionDate: '2026-08-31'
    });
    expect(future.success).toBe(false);
    if (!future.success) {
      expect(future.error.issues[0].message).toContain('later than today (UTC)');
    }
  });

  it('defensively rejects future rows and reports CSV row numbers', async () => {
    const now = new Date('2026-08-30T12:00:00.000Z');
    const { createTransaction } = await import('../src/lib/server/transactions');
    await expect(
      createTransaction({ ...validInput, transactionDate: '2026-09-01T12:00:00.000Z' }, now)
    ).rejects.toThrow(/later than today \(UTC\)/);

    const { previewTransactionsCsv } = await import('../src/lib/server/csv');
    const csv = [
      'type,asset_provider,asset_provider_coin_id,asset_symbol,asset_name,quantity,fiat_amount,fiat_currency,fee_amount,fee_currency,transaction_date,notes',
      'buy,coingecko,bitcoin,BTC,Bitcoin,1,100,EUR,,EUR,2026-09-01,future'
    ].join('\n');
    expect(() => previewTransactionsCsv(csv, now)).toThrow(/Row 1:.*later than today/);
  });

  it('keeps legacy future rows visible but excludes them from current accounting rebuilds', async () => {
    const now = new Date('2026-08-30T12:00:00.000Z');
    const { db } = await import('../src/lib/server/db/client');
    const { assets, transactions } = await import('../src/lib/server/db/schema');
    const { countFutureTransactions, listCurrentTransactionsWithAssets, listTransactions } =
      await import('../src/lib/server/transactions');
    const { listOpenLots, rebuildPortfolioAccounting } =
      await import('../src/lib/server/portfolio/accounting');

    db.insert(assets)
      .values({
        id: 'coingecko:bitcoin',
        provider: 'coingecko',
        providerCoinId: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        imageUrl: null,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .run();
    db.insert(transactions)
      .values([
        { ...record('a-current', 'buy', '1', '100'), transactionDate: '2026-08-30T12:00:00.000Z' },
        { ...record('b-future', 'buy', '5', '500'), transactionDate: '2026-09-01T12:00:00.000Z' }
      ])
      .run();

    expect(listTransactions()).toHaveLength(2);
    expect(listCurrentTransactionsWithAssets(now).map((row) => row.id)).toEqual(['a-current']);
    expect(countFutureTransactions(now)).toBe(1);

    await rebuildPortfolioAccounting(now);
    const first = listOpenLots().map((lot) => ({
      quantity: lot.remainingQuantity,
      cost: lot.costBasisTotal,
      average: lot.costBasisPerUnit
    }));
    await rebuildPortfolioAccounting(now);
    const second = listOpenLots().map((lot) => ({
      quantity: lot.remainingQuantity,
      cost: lot.costBasisTotal,
      average: lot.costBasisPerUnit
    }));

    expect(first).toEqual([{ quantity: '1', cost: '100', average: '100' }]);
    expect(second).toEqual(first);
  });
});
