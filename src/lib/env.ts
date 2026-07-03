import type { Currency } from './types';

export const APP_NAME = process.env.PUBLIC_APP_NAME ?? 'Krypto Dashboard';

export function getDefaultCurrency(): Currency {
  const configured = (process.env.BASE_CURRENCY ?? 'EUR').toUpperCase();
  return configured === 'USD' ? 'USD' : 'EUR';
}

export function getPriceCacheTtlSeconds(): number {
  const parsed = Number(process.env.PRICE_CACHE_TTL_SECONDS ?? '600');
  return Number.isFinite(parsed) && parsed >= 60 ? parsed : 600;
}

export function getConfiguredProvider(): string {
  return process.env.PRICE_PROVIDER ?? 'coingecko';
}
