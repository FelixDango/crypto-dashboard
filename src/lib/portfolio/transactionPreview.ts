import Decimal from 'decimal.js';
import { moneyText } from '$lib/portfolio/decimal';

export type TransactionPreview = {
  label: 'Unit cost' | 'Net unit proceeds';
  value: string;
};

function decimalValue(value: string): Decimal | null {
  try {
    const cleaned = value.trim();
    if (!cleaned) return null;
    const decimal = new Decimal(cleaned);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

export function calculateTransactionPreview(
  type: 'buy' | 'sell',
  quantityValue: string,
  fiatValue: string,
  feeValue: string
): TransactionPreview | null {
  const quantity = decimalValue(quantityValue);
  const fiat = decimalValue(fiatValue);
  const fee = decimalValue(feeValue) ?? new Decimal(0);

  if (!quantity || !fiat || quantity.lte(0) || fiat.lte(0) || fee.lt(0)) return null;

  const netFiat = type === 'buy' ? fiat.plus(fee) : fiat.minus(fee);
  if (netFiat.lt(0)) return null;

  return {
    label: type === 'buy' ? 'Unit cost' : 'Net unit proceeds',
    value: moneyText(netFiat.div(quantity))
  };
}
