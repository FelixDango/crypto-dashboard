import { eq } from 'drizzle-orm';
import { getDefaultCurrency, getConfiguredProvider } from '$lib/env';
import type { Currency } from '$lib/types';
import { db } from './db/client';
import { settings } from './db/schema';

export type AppSettings = {
  baseCurrency: Currency;
  priceProvider: string;
};

export function getSetting(key: string): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export function getAppSettings(): AppSettings {
  const base = (getSetting('base_currency') ?? getDefaultCurrency()).toUpperCase();
  return {
    baseCurrency: base === 'USD' ? 'USD' : 'EUR',
    priceProvider: getSetting('price_provider') ?? getConfiguredProvider()
  };
}

export function updateAppSettings(input: AppSettings): void {
  setSetting('base_currency', input.baseCurrency);
  setSetting('price_provider', input.priceProvider);
}
