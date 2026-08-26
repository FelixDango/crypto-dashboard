import { z } from 'zod';
import Decimal from 'decimal.js';

const decimalString = (label: string, minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine((value) => {
      try {
        return new Decimal(value).isFinite();
      } catch {
        return false;
      }
    }, `${label} must be a number.`)
    .refine((value) => {
      try {
        const parsed = new Decimal(value);
        return parsed.gte(minimum) && parsed.lte(maximum);
      } catch {
        return false;
      }
    }, `${label} must be between ${minimum} and ${maximum}.`);

export const marketSignalSettingsSchema = z.object({
  fearGreedMax: decimalString('Fear & Greed threshold', 0, 100),
  rsi14Max: decimalString('RSI threshold', 0, 100),
  sma200DeviationMax: decimalString('SMA deviation threshold', -100, 100),
  drawdown365Max: decimalString('Drawdown threshold', -100, 0),
  bollingerZMax: decimalString('Bollinger threshold', -10, 10),
  requiredFavorableCount: z.coerce
    .number()
    .int('Required favorable count must be a whole number.')
    .min(1)
    .max(5)
});

export type MarketSignalSettingsInput = z.infer<typeof marketSignalSettingsSchema>;

export function parseMarketSignalSettingsForm(formData: FormData) {
  return marketSignalSettingsSchema.safeParse({
    fearGreedMax: formData.get('fear_greed_max'),
    rsi14Max: formData.get('rsi_14_max'),
    sma200DeviationMax: formData.get('sma_200_deviation_max'),
    drawdown365Max: formData.get('drawdown_365_max'),
    bollingerZMax: formData.get('bollinger_z_max'),
    requiredFavorableCount: formData.get('required_favorable_count')
  });
}
