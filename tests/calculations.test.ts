import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateHoldings, calculatePortfolio } from '$lib/portfolio/calculations';
import type { PriceQuote, TransactionRecord } from '$lib/types';

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
    expect(holdings[0].realizedProfitApprox).toBe('25');
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
    expect(new Decimal(portfolio.totals.roiPercent).toFixed(2)).toBe('33.33');
  });
});
