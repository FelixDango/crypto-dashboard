import { describe, expect, it } from 'vitest';
import { calculateTransactionPreview } from '$lib/portfolio/transactionPreview';
import { transactionInputSchema } from '$lib/validation/transaction';

const validTransaction = {
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
  feeAmount: '2',
  feeCurrency: 'EUR',
  transactionDate: '2026-07-27',
  notes: ''
};

describe('manual transaction entry', () => {
  it('includes fees in the buy unit-cost preview', () => {
    expect(calculateTransactionPreview('buy', '2', '100', '4')).toEqual({
      label: 'Unit cost',
      value: '52'
    });
  });

  it('deducts fees from the sell unit-proceeds preview', () => {
    expect(calculateTransactionPreview('sell', '2', '100', '4')).toEqual({
      label: 'Net unit proceeds',
      value: '48'
    });
  });

  it('keeps preview calculations decimal-safe', () => {
    expect(calculateTransactionPreview('buy', '3', '1', '0')?.value).toBe('0.333333333333333333');
  });

  it('returns a specific message when a typed coin was not selected', () => {
    const result = transactionInputSchema.safeParse({
      ...validTransaction,
      asset: {
        ...validTransaction.asset,
        providerCoinId: '',
        symbol: '',
        name: ''
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'Select a coin from the search results.'
      );
    }
  });

  it('names the invalid money field in validation feedback', () => {
    const result = transactionInputSchema.safeParse({
      ...validTransaction,
      fiatAmount: 'not-a-number'
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'Fiat amount must be a valid decimal number.'
      );
    }
  });
});
