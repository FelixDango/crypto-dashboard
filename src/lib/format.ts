import type { Currency } from './types';

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: Currency) {
  const key = `currency:${currency}`;
  const cached = currencyFormatters.get(key);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  });
  currencyFormatters.set(key, formatter);
  return formatter;
}

export function asNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrency(value: string | number, currency: Currency): string {
  return getCurrencyFormatter(currency).format(asNumber(value));
}

export function formatPercent(value: string | number): string {
  return `${asNumber(value).toFixed(2)}%`;
}

export function formatCrypto(value: string | number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 8
  }).format(asNumber(value));
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function signedClass(value: string | number): 'positive' | 'negative' | 'neutral' {
  const number = asNumber(value);
  if (number > 0) return 'positive';
  if (number < 0) return 'negative';
  return 'neutral';
}
