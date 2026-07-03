import type { Currency } from '$lib/types';

export type FxProviderRate = {
  from: Currency;
  to: Currency;
  rate: string;
  rateDate: string;
  capturedAt: string;
};

export type FxProvider = {
  id: string;
  label: string;
  getDailyRate(from: Currency, to: Currency, date: string): Promise<FxProviderRate>;
};
