import type { FxProvider } from './provider';
import { frankfurterProvider } from './frankfurter';

const providers = new Map<string, FxProvider>([[frankfurterProvider.id, frankfurterProvider]]);

export function getFxProvider(id = 'frankfurter'): FxProvider {
  return providers.get(id) ?? frankfurterProvider;
}

export function listFxProviders() {
  return [...providers.values()].map((provider) => ({
    id: provider.id,
    label: provider.label
  }));
}
