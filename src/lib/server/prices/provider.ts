import type { AssetRecord, Currency } from '$lib/types';

export type ProviderPrice = {
  providerCoinId: string;
  price: string;
  capturedAt?: string;
};

export type PriceProvider = {
  id: string;
  label: string;
  searchCoins(query: string): Promise<AssetRecord[]>;
  getCurrentPrices(providerCoinIds: string[], currency: Currency): Promise<ProviderPrice[]>;
  getHistoricalPrice(
    providerCoinId: string,
    date: string,
    currency: Currency
  ): Promise<ProviderPrice>;
};
