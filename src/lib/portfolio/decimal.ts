import Decimal from 'decimal.js';

Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

function finite(value: Decimal): Decimal {
  return value.isFinite() ? value : new Decimal(0);
}

export function quantityText(value: Decimal): string {
  return finite(value).toDecimalPlaces(30).toString();
}

export function moneyText(value: Decimal): string {
  return finite(value).toDecimalPlaces(18).toString();
}

export function rateText(value: Decimal): string {
  return finite(value).toDecimalPlaces(30).toString();
}

export function percentText(value: Decimal): string {
  return finite(value).toDecimalPlaces(18).toString();
}
