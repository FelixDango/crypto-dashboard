import type { PriceProvider } from './provider';
import { coingeckoProvider } from './coingecko';

const providers = new Map<string, PriceProvider>([[coingeckoProvider.id, coingeckoProvider]]);

export function getPriceProvider(id = 'coingecko'): PriceProvider {
  return providers.get(id) ?? coingeckoProvider;
}

export function listPriceProviders() {
  return [...providers.values()].map((provider) => ({
    id: provider.id,
    label: provider.label
  }));
}
