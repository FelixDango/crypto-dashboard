import { eq } from 'drizzle-orm';
import type { MarketSignalSettings } from '$lib/market-signals/types';
import type { MarketSignalSettingsInput } from '$lib/validation/market-signals';
import { marketSignalSettingsSchema } from '$lib/validation/market-signals';
import { db } from '$lib/server/db/client';
import { marketSignalSettings } from '$lib/server/db/schema';

const defaults = {
  fearGreedMax: '25',
  rsi14Max: '30',
  sma200DeviationMax: '-10',
  drawdown365Max: '-30',
  bollingerZMax: '-1.5',
  requiredFavorableCount: 4
} as const;

function ensureSettings(): void {
  const now = new Date().toISOString();
  db.insert(marketSignalSettings)
    .values({ id: 1, ...defaults, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: marketSignalSettings.id })
    .run();
}

export function getMarketSignalSettings(): MarketSignalSettings {
  ensureSettings();
  const row = db.select().from(marketSignalSettings).where(eq(marketSignalSettings.id, 1)).get();
  if (!row) throw new Error('Market signal settings are unavailable.');
  return { ...row, id: 1 };
}

export function updateMarketSignalSettings(input: MarketSignalSettingsInput): MarketSignalSettings {
  const parsed = marketSignalSettingsSchema.parse(input);
  ensureSettings();
  db.update(marketSignalSettings)
    .set({
      fearGreedMax: parsed.fearGreedMax,
      rsi14Max: parsed.rsi14Max,
      sma200DeviationMax: parsed.sma200DeviationMax,
      drawdown365Max: parsed.drawdown365Max,
      bollingerZMax: parsed.bollingerZMax,
      requiredFavorableCount: parsed.requiredFavorableCount,
      updatedAt: new Date().toISOString()
    })
    .where(eq(marketSignalSettings.id, 1))
    .run();
  return getMarketSignalSettings();
}
