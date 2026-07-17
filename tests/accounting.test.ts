import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionInput } from '../src/lib/server/transactions';

function resetDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-accounting-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.BASE_CURRENCY = 'EUR';
  process.env.PRICE_PROVIDER = 'coingecko';
}

const btcAsset = {
  provider: 'coingecko',
  providerCoinId: 'bitcoin',
  symbol: 'BTC',
  name: 'Bitcoin'
};

function tx(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    asset: btcAsset,
    type: 'buy',
    quantity: '1',
    fiatAmount: '100',
    fiatCurrency: 'EUR',
    feeAmount: null,
    feeCurrency: 'EUR',
    transactionDate: '2025-01-01T12:00:00.000Z',
    ...overrides
  };
}

async function modules() {
  const transactionsModule = await import('../src/lib/server/transactions');
  const accountingModule = await import('../src/lib/server/portfolio/accounting');
  const dbModule = await import('../src/lib/server/db/client');
  const schema = await import('../src/lib/server/db/schema');

  return {
    ...transactionsModule,
    ...accountingModule,
    ...dbModule,
    ...schema
  };
}

describe('average-cost accounting', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDatabase();
  });

  it('creates one lot for one buy', async () => {
    const { createTransaction, listOpenLots } = await modules();

    await createTransaction(tx({ quantity: '2', fiatAmount: '200', feeAmount: '10' }));

    const lots = listOpenLots('coingecko:bitcoin');
    expect(lots).toHaveLength(1);
    expect(lots[0].originalQuantity).toBe('2');
    expect(lots[0].remainingQuantity).toBe('2');
    expect(lots[0].costBasisTotal).toBe('210');
    expect(lots[0].costBasisPerUnit).toBe('105');
  });

  it('pools multiple buys into one average-cost position', async () => {
    const { createTransaction, listOpenLots } = await modules();

    await createTransaction(tx({ quantity: '1', fiatAmount: '100' }));
    await createTransaction(
      tx({ quantity: '1', fiatAmount: '150', transactionDate: '2025-01-02T12:00:00.000Z' })
    );

    const lots = listOpenLots('coingecko:bitcoin');
    expect(lots).toHaveLength(1);
    expect(lots[0].originalQuantity).toBe('2');
    expect(lots[0].remainingQuantity).toBe('2');
    expect(lots[0].costBasisTotal).toBe('250');
    expect(lots[0].costBasisPerUnit).toBe('125');
  });

  it('records a partial sell against the pooled average cost', async () => {
    const { createTransaction, listLotDisposals, listOpenLots } = await modules();

    await createTransaction(tx({ quantity: '2', fiatAmount: '200' }));
    await createTransaction(
      tx({ type: 'sell', quantity: '0.5', fiatAmount: '75', transactionDate: '2025-02-01' })
    );

    const lots = listOpenLots('coingecko:bitcoin');
    const disposals = listLotDisposals('coingecko:bitcoin');

    expect(lots).toHaveLength(1);
    expect(lots[0].remainingQuantity).toBe('1.5');
    expect(lots[0].costBasisTotal).toBe('150');
    expect(disposals).toHaveLength(1);
    expect(disposals[0].quantitySold).toBe('0.5');
    expect(disposals[0].proceedsAmount).toBe('75');
    expect(disposals[0].costBasisAmount).toBe('50');
    expect(disposals[0].realizedProfit).toBe('25');
  });

  it('uses the pooled average after differently priced buys', async () => {
    const { createTransaction, listLotDisposals, listOpenLots } = await modules();

    await createTransaction(tx({ quantity: '1', fiatAmount: '100' }));
    await createTransaction(
      tx({ quantity: '1', fiatAmount: '200', transactionDate: '2025-01-02T12:00:00.000Z' })
    );
    await createTransaction(
      tx({ type: 'sell', quantity: '1.5', fiatAmount: '450', transactionDate: '2025-02-01' })
    );

    const lots = listOpenLots('coingecko:bitcoin');
    const disposals = listLotDisposals('coingecko:bitcoin');

    expect(lots).toHaveLength(1);
    expect(lots[0].remainingQuantity).toBe('0.5');
    expect(lots[0].costBasisTotal).toBe('75');
    expect(lots[0].costBasisPerUnit).toBe('150');
    expect(disposals).toHaveLength(1);
    expect(disposals[0].quantitySold).toBe('1.5');
    expect(disposals[0].costBasisAmount).toBe('225');
    expect(disposals[0].realizedProfit).toBe('225');
  });

  it('fully sells a lot and leaves no open lots', async () => {
    const { assetLots, createTransaction, db, listLotDisposals, listOpenLots } = await modules();

    await createTransaction(tx({ quantity: '1', fiatAmount: '100' }));
    await createTransaction(
      tx({ type: 'sell', quantity: '1', fiatAmount: '150', transactionDate: '2025-02-01' })
    );

    const allLots = db.select().from(assetLots).all();
    expect(listOpenLots('coingecko:bitcoin')).toHaveLength(0);
    expect(allLots[0].remainingQuantity).toBe('0');
    expect(allLots[0].costBasisTotal).toBe('0');
    expect(listLotDisposals('coingecko:bitcoin')[0].realizedProfit).toBe('50');
  });

  it('rejects oversells', async () => {
    const { createTransaction, db, transactions } = await modules();

    await expect(
      createTransaction(tx({ type: 'sell', quantity: '0.1', fiatAmount: '20' }))
    ).rejects.toThrow(/Sell quantity exceeds available BTC/);

    await createTransaction(tx({ quantity: '1', fiatAmount: '100' }));
    await expect(
      createTransaction(tx({ type: 'sell', quantity: '2', fiatAmount: '300' }))
    ).rejects.toThrow(/Sell quantity exceeds available BTC/);

    expect(db.select().from(transactions).all()).toHaveLength(1);
  });

  it('handles buy and sell fees in cost basis and realized proceeds', async () => {
    const { createTransaction, listLotDisposals, listOpenLots } = await modules();

    await createTransaction(tx({ quantity: '1', fiatAmount: '100', feeAmount: '2' }));
    await createTransaction(
      tx({
        type: 'sell',
        quantity: '0.5',
        fiatAmount: '80',
        feeAmount: '1',
        transactionDate: '2025-02-01'
      })
    );

    const lot = listOpenLots('coingecko:bitcoin')[0];
    const disposal = listLotDisposals('coingecko:bitcoin')[0];

    expect(lot.costBasisTotal).toBe('51');
    expect(disposal.proceedsAmount).toBe('79');
    expect(disposal.costBasisAmount).toBe('51');
    expect(disposal.realizedProfit).toBe('28');
  });

  it('orders same-day transactions chronologically', async () => {
    const { createTransaction, listLotDisposals, listOpenLots } = await modules();

    await createTransaction(tx({ transactionDate: '2025-01-01T12:00:00.000Z' }));
    await createTransaction(
      tx({
        type: 'sell',
        quantity: '0.25',
        fiatAmount: '150',
        transactionDate: '2025-01-01T12:00:00.000Z'
      })
    );

    expect(listOpenLots('coingecko:bitcoin')[0].remainingQuantity).toBe('0.75');
    expect(listLotDisposals('coingecko:bitcoin')[0].realizedProfit).toBe('125');
  });

  it('rebuilds accounting after edits', async () => {
    const { createTransaction, listLotDisposals, listOpenLots, updateTransaction } =
      await modules();

    const buy = await createTransaction(tx({ quantity: '1', fiatAmount: '100' }));
    await createTransaction(
      tx({ type: 'sell', quantity: '0.5', fiatAmount: '80', transactionDate: '2025-02-01' })
    );
    await updateTransaction(buy.id, tx({ quantity: '1', fiatAmount: '200' }));

    expect(listOpenLots('coingecko:bitcoin')[0].costBasisTotal).toBe('100');
    expect(listLotDisposals('coingecko:bitcoin')[0].costBasisAmount).toBe('100');
    expect(listLotDisposals('coingecko:bitcoin')[0].realizedProfit).toBe('-20');
  });

  it('rebuilds accounting after deletes', async () => {
    const { createTransaction, deleteTransaction, listLotDisposals, listOpenLots } =
      await modules();

    await createTransaction(tx({ quantity: '1', fiatAmount: '100' }));
    await createTransaction(
      tx({ quantity: '1', fiatAmount: '300', transactionDate: '2025-01-02T12:00:00.000Z' })
    );
    const sell = await createTransaction(
      tx({ type: 'sell', quantity: '1.5', fiatAmount: '600', transactionDate: '2025-02-01' })
    );

    await deleteTransaction(sell.id);

    expect(listLotDisposals('coingecko:bitcoin')).toHaveLength(0);
    const position = listOpenLots('coingecko:bitcoin')[0];
    expect(position.remainingQuantity).toBe('2');
    expect(position.costBasisTotal).toBe('400');
    expect(position.costBasisPerUnit).toBe('200');
  });

  it('matches the canonical multi-buy partial-sale average-cost example', async () => {
    const { createTransaction, listLotDisposals, listOpenLots } = await modules();

    await createTransaction(tx({ quantity: '1', fiatAmount: '100' }));
    await createTransaction(
      tx({ quantity: '1', fiatAmount: '200', transactionDate: '2025-01-02T12:00:00.000Z' })
    );
    await createTransaction(
      tx({ type: 'sell', quantity: '1', fiatAmount: '300', transactionDate: '2025-02-01' })
    );

    const position = listOpenLots('coingecko:bitcoin')[0];
    const disposal = listLotDisposals('coingecko:bitcoin')[0];
    expect(position.remainingQuantity).toBe('1');
    expect(position.costBasisTotal).toBe('150');
    expect(position.costBasisPerUnit).toBe('150');
    expect(disposal.costBasisAmount).toBe('150');
    expect(disposal.realizedProfit).toBe('150');
  });

  it('preserves quantities beyond twelve decimal places', async () => {
    const { createTransaction, listOpenLots } = await modules();

    await createTransaction(
      tx({ quantity: '1.000000000000000001', fiatAmount: '100', feeAmount: '0' })
    );

    const position = listOpenLots('coingecko:bitcoin')[0];
    expect(position.originalQuantity).toBe('1.000000000000000001');
    expect(position.remainingQuantity).toBe('1.000000000000000001');
  });

  it('never persists an unconverted 1:1 FX fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('FX provider unavailable');
      })
    );
    const { createTransaction, db, getFxRateForDate, listOpenLots, transactions } =
      await (async () => {
        const loaded = await modules();
        const fx = await import('../src/lib/server/fx/cache');
        return { ...loaded, ...fx };
      })();

    const quote = await getFxRateForDate('USD', 'EUR', '2025-01-01');
    expect(quote.status).toBe('missing');
    expect(quote.rate).toBeNull();

    await expect(createTransaction(tx({ fiatCurrency: 'USD', fiatAmount: '100' }))).rejects.toThrow(
      /Accounting rebuild deferred/
    );
    expect(db.select().from(transactions).all()).toHaveLength(0);
    expect(listOpenLots()).toHaveLength(0);
  });
});
