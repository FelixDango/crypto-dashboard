import type { AssetRecord, Currency } from '$lib/types';
import type { PriceProvider, ProviderPrice } from './provider';
import { fetchWithResilience, readJsonResponse } from '$lib/server/http';

const API_BASE = 'https://api.coingecko.com/api/v3';

type CoinGeckoSearchResponse = {
  coins?: Array<{
    id: string;
    name: string;
    symbol: string;
    thumb?: string;
    large?: string;
  }>;
};

type CoinGeckoSimplePriceResponse = Record<
  string,
  Record<string, number> & { last_updated_at?: number }
>;

type CoinGeckoHistoricalResponse = {
  market_data?: {
    current_price?: Record<string, number>;
  };
};

function providerAsset(coin: {
  id: string;
  name: string;
  symbol: string;
  thumb?: string;
  large?: string;
}): AssetRecord {
  return {
    id: `coingecko:${coin.id}`,
    provider: 'coingecko',
    providerCoinId: coin.id,
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    imageUrl: coin.large ?? coin.thumb ?? null,
    createdAt: '',
    updatedAt: ''
  };
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetchWithResilience(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'personal-krypto-dashboard/0.1'
    }
  });

  if (!response.ok) {
    throw new Error(`CoinGecko request failed with ${response.status}.`);
  }

  return readJsonResponse<T>(response);
}

export const coingeckoProvider: PriceProvider = {
  id: 'coingecko',
  label: 'CoinGecko',

  async searchCoins(query: string): Promise<AssetRecord[]> {
    const url = new URL(`${API_BASE}/search`);
    url.searchParams.set('query', query);
    const payload = await fetchJson<CoinGeckoSearchResponse>(url);
    return (payload.coins ?? []).slice(0, 12).map(providerAsset);
  },

  async getCurrentPrices(providerCoinIds: string[], currency: Currency): Promise<ProviderPrice[]> {
    if (providerCoinIds.length === 0) return [];

    const url = new URL(`${API_BASE}/simple/price`);
    url.searchParams.set('ids', providerCoinIds.join(','));
    url.searchParams.set('vs_currencies', currency.toLowerCase());
    url.searchParams.set('include_last_updated_at', 'true');

    const payload = await fetchJson<CoinGeckoSimplePriceResponse>(url);
    const currencyKey = currency.toLowerCase();

    const prices: ProviderPrice[] = [];
    for (const providerCoinId of providerCoinIds) {
      const coin = payload[providerCoinId];
      const price = coin?.[currencyKey];
      if (typeof price !== 'number') continue;
      prices.push({
        providerCoinId,
        price: price.toString(),
        capturedAt: coin.last_updated_at
          ? new Date(coin.last_updated_at * 1000).toISOString()
          : new Date().toISOString()
      });
    }

    return prices;
  },

  async getHistoricalPrice(
    providerCoinId: string,
    date: string,
    currency: Currency
  ): Promise<ProviderPrice> {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Invalid historical price date.');
    }

    const day = String(parsed.getUTCDate()).padStart(2, '0');
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const year = parsed.getUTCFullYear();
    const url = new URL(`${API_BASE}/coins/${providerCoinId}/history`);
    url.searchParams.set('date', `${day}-${month}-${year}`);
    url.searchParams.set('localization', 'false');

    const payload = await fetchJson<CoinGeckoHistoricalResponse>(url);
    const price = payload.market_data?.current_price?.[currency.toLowerCase()];
    if (typeof price !== 'number') {
      throw new Error('Historical price was unavailable from CoinGecko.');
    }

    return {
      providerCoinId,
      price: price.toString(),
      capturedAt: new Date(Date.UTC(year, parsed.getUTCMonth(), parsed.getUTCDate())).toISOString()
    };
  }
};
