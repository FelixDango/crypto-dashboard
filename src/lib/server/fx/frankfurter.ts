import type { Currency } from '$lib/types';
import type { FxProvider, FxProviderRate } from './provider';
import { fetchWithResilience, readJsonResponse } from '$lib/server/http';

const API_BASE = 'https://api.frankfurter.app';

type FrankfurterResponse = {
  date?: string;
  rates?: Record<string, number>;
};

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetchWithResilience(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'personal-krypto-dashboard/0.2'
    }
  });

  if (!response.ok) {
    throw new Error(`FX request failed with ${response.status}.`);
  }

  return readJsonResponse<T>(response);
}

export const frankfurterProvider: FxProvider = {
  id: 'frankfurter',
  label: 'Frankfurter',

  async getDailyRate(from: Currency, to: Currency, date: string): Promise<FxProviderRate> {
    const url = new URL(`${API_BASE}/${date}`);
    url.searchParams.set('from', from);
    url.searchParams.set('to', to);

    const payload = await fetchJson<FrankfurterResponse>(url);
    const rate = payload.rates?.[to];
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      throw new Error(`FX rate ${from}/${to} was unavailable for ${date}.`);
    }

    return {
      from,
      to,
      rate: rate.toString(),
      rateDate: payload.date ?? date,
      capturedAt: new Date().toISOString()
    };
  }
};
