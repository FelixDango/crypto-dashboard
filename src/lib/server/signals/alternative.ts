import Decimal from 'decimal.js';
import { z } from 'zod';
import type { MarketSentiment } from '$lib/market-signals/types';
import { fetchWithResilience, readJsonResponse } from '$lib/server/http';

export const ALTERNATIVE_ME_ATTRIBUTION_URL = 'https://alternative.me/crypto/fear-and-greed-index/';
const API_URL = 'https://api.alternative.me/fng/?limit=2&format=json';

const responseSchema = z.object({
  data: z
    .array(
      z.object({
        value: z.string(),
        value_classification: z.string().min(1),
        timestamp: z.string()
      })
    )
    .min(1)
});

export async function fetchFearAndGreed(now = new Date()): Promise<MarketSentiment> {
  const response = await fetchWithResilience(API_URL, {
    headers: { accept: 'application/json', 'user-agent': 'personal-krypto-dashboard/0.1' }
  });
  if (!response.ok) {
    throw new Error(`Alternative.me request failed with ${response.status}.`);
  }

  const payload = responseSchema.parse(await readJsonResponse<unknown>(response));
  const latest = payload.data
    .map((item) => ({ item, timestamp: Number(item.timestamp) }))
    .filter(({ timestamp }) => Number.isFinite(timestamp) && timestamp > 0)
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  if (!latest) throw new Error('Alternative.me returned no valid sentiment snapshot.');

  const value = new Decimal(latest.item.value);
  if (!value.isFinite() || value.lt(0) || value.gt(100)) {
    throw new Error('Alternative.me returned an invalid sentiment value.');
  }
  const observedAt = new Date(latest.timestamp * 1_000);
  if (Number.isNaN(observedAt.getTime())) {
    throw new Error('Alternative.me returned an invalid sentiment timestamp.');
  }

  return {
    provider: 'alternative.me',
    observedOn: observedAt.toISOString().slice(0, 10),
    value: value.toString(),
    classification: latest.item.value_classification,
    sourceUrl: ALTERNATIVE_ME_ATTRIBUTION_URL,
    capturedAt: now.toISOString()
  };
}
