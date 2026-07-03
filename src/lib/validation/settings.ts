import { z } from 'zod';

export const settingsSchema = z.object({
  baseCurrency: z.enum(['EUR', 'USD']),
  priceProvider: z.enum(['coingecko'])
});
