import { z } from 'zod';
import type { AnalyticsRange } from '$lib/analytics/types';

export const analyticsRangeSchema = z.enum(['24h', '7d', '30d', '90d', '1y', 'all']);

export function parseAnalyticsRange(value: string | null, fallback: AnalyticsRange = '30d') {
  return analyticsRangeSchema.safeParse(value ?? fallback);
}
