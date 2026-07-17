import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateHoldings, calculatePortfolio } from '$lib/portfolio/calculations';
import type { NormalizedTransactionRecord, PriceQuote, TransactionRecord } from '$lib/types';

function transaction(overrides: Partial<TransactionRecord>): TransactionRecord {
  return {
    id: crypto.randomUUID(),
    assetId: 'coingecko:bitcoin',
    assetSymbol: 'BTC',
    assetName: 'Bitcoin',
    type: 'buy',
    quantity: '1',
    fiatAmount: '100',
    fiatCurrency: 'EUR',
    feeAmount: null,
    feeCurrency: null,
    importBatchId: null,
    rowHash: null,
    transactionDate: '2025-01-01T12:00:00.000Z',
    notes: null,
    createdAt: '2025-01-01T12:00:00.000Z',
    updatedAt: '2025-01-01T12:00:00.000Z',
    ...overrides
  };
}

const btcQuote: PriceQuote = {
  assetId: 'coingecko:bitcoin',
  price: '200',
  currency: 'EUR',
  source: 'test',
  capturedAt: '2026-01-01T12:00:00.000Z',
  stale: false
};

describe('portfolio calculations', () => {
  it('uses average cost basis for open ROI instead of balance alone', () => {
    const holdings = calculateHoldings(
      [
        transaction({ quantity: '1', fiatAmount: '100', feeAmount: '10' }),
        transaction({ quantity: '1', fiatAmount: '200' })
      ],
      [btcQuote]
    );

    expect(holdings).toHaveLength(1);
    expect(holdings[0].averageCost).toBe('155');
    expect(holdings[0].quantity).toBe('2');
    expect(holdings[0].currentValue).toBe('400');
    expect(holdings[0].costBasis).toBe('310');
    expect(holdings[0].unrealizedProfit).toBe('90');
    expect(new Decimal(holdings[0].roiPercent).toFixed(2)).toBe('29.03');
  });

  it('tracks approximate realized profit for sells while reducing open quantity', () => {
    const holdings = calculateHoldings(
      [
        transaction({ quantity: '2', fiatAmount: '200' }),
        transaction({
          type: 'sell',
          quantity: '0.5',
          fiatAmount: '75',
          feeAmount: '0'
        })
      ],
      [{ ...btcQuote, price: '120' }]
    );

    expect(holdings[0].quantity).toBe('1.5');
    expect(holdings[0].averageCost).toBe('100');
    expect(holdings[0].currentValue).toBe('180');
    expect(holdings[0].costBasis).toBe('150');
    expect(holdings[0].unrealizedProfit).toBe('30');
    expect(holdings[0].realizedProfit).toBe('25');
    expect(holdings[0].realizedProfitApprox).toBe('25');
  });

  it('realizes sells against the average cost before later buys', () => {
    const holdings = calculateHoldings(
      [
        transaction({
          quantity: '2',
          fiatAmount: '200',
          transactionDate: '2025-01-01T12:00:00.000Z'
        }),
        transaction({
          type: 'sell',
          quantity: '1',
          fiatAmount: '150',
          transactionDate: '2025-02-01T12:00:00.000Z'
        }),
        transaction({
          quantity: '1',
          fiatAmount: '300',
          transactionDate: '2025-03-01T12:00:00.000Z'
        })
      ],
      [{ ...btcQuote, price: '250' }]
    );

    expect(holdings[0].quantity).toBe('2');
    expect(holdings[0].costBasis).toBe('400');
    expect(holdings[0].averageCost).toBe('200');
    expect(holdings[0].realizedProfit).toBe('50');
    expect(holdings[0].ledger).toHaveLength(3);
    expect(holdings[0].ledger[1].runningAverageCost).toBe('100');
    expect(holdings[0].ledger[2].runningAverageCost).toBe('200');
  });

  it('uses pooled average cost for a sale after differently priced buys', () => {
    const holdings = calculateHoldings(
      [
        transaction({
          quantity: '1',
          fiatAmount: '100',
          transactionDate: '2025-01-01T12:00:00.000Z'
        }),
        transaction({
          quantity: '1',
          fiatAmount: '200',
          transactionDate: '2025-01-02T12:00:00.000Z'
        }),
        transaction({
          type: 'sell',
          quantity: '1',
          fiatAmount: '300',
          transactionDate: '2025-02-01T12:00:00.000Z'
        })
      ],
      [btcQuote]
    );

    expect(holdings[0].quantity).toBe('1');
    expect(holdings[0].averageCost).toBe('150');
    expect(holdings[0].costBasis).toBe('150');
    expect(holdings[0].realizedProfit).toBe('150');
    expect(holdings[0].ledger[2].realizedCostBasis).toBe('150');
  });

  it('preserves 18-decimal token quantities', () => {
    const holdings = calculateHoldings(
      [transaction({ quantity: '1.000000000000000001', fiatAmount: '100' })],
      [btcQuote]
    );

    expect(holdings[0].quantity).toBe('1.000000000000000001');
  });

  it('uses normalized fiat amounts for mixed-currency transactions', () => {
    const usdBuy = {
      ...transaction({ fiatAmount: '100', fiatCurrency: 'USD' }),
      normalizedFiatAmount: '90',
      normalizedFeeAmount: '0',
      fxRate: '0.9',
      fxSource: 'test',
      fxDate: '2025-01-01',
      fxCapturedAt: '2025-01-02T12:00:00.000Z',
      fxStatus: 'complete',
      fxComplete: true
    } satisfies NormalizedTransactionRecord;

    const portfolio = calculatePortfolio([usdBuy], [btcQuote], 'EUR');

    expect(portfolio.holdings[0].totalBuyCost).toBe('90');
    expect(portfolio.holdings[0].averageCost).toBe('90');
    expect(portfolio.totals.investedAmount).toBe('90');
    expect(portfolio.holdings[0].ledger[0].fxRate).toBe('0.9');
  });

  it('rolls holdings into portfolio totals', () => {
    const portfolio = calculatePortfolio(
      [
        transaction({ quantity: '1', fiatAmount: '100' }),
        transaction({ quantity: '1', fiatAmount: '200' })
      ],
      [btcQuote],
      'EUR'
    );

    expect(portfolio.totals.currentValue).toBe('400');
    expect(portfolio.totals.investedAmount).toBe('300');
    expect(portfolio.totals.unrealizedProfit).toBe('100');
    expect(portfolio.totals.realizedProfit).toBe('0');
    expect(new Decimal(portfolio.totals.roiPercent).toFixed(2)).toBe('33.33');
  });

  it('does not treat missing prices as a 100% loss', () => {
    const portfolio = calculatePortfolio(
      [transaction({ quantity: '1', fiatAmount: '55000' })],
      [],
      'EUR'
    );

    expect(portfolio.holdings[0].priceStatus).toBe('missing');
    expect(portfolio.holdings[0].currentValue).toBe('0');
    expect(portfolio.holdings[0].unrealizedProfit).toBe('0');
    expect(portfolio.holdings[0].roiPercent).toBe('0');
    expect(portfolio.totals.unrealizedProfit).toBe('0');
    expect(portfolio.totals.totalProfit).toBe('0');
    expect(portfolio.totals.roiPercent).toBe('0');
    expect(portfolio.totals.stalePriceCount).toBe(0);
    expect(portfolio.totals.missingPriceCount).toBe(1);
    expect(portfolio.totals.financialDataComplete).toBe(false);
    expect(portfolio.allocation).toEqual([]);
    expect(portfolio.worstPerformer).toBeNull();
  });
});
