import type { PageServerLoad } from './$types';
import {
  ANALYTICS_RANGES,
  type AnalyticsAllocationResponse,
  type AnalyticsDrawdownResponse,
  type AnalyticsHealthSummary,
  type AnalyticsMonthlyResponse,
  type AnalyticsPerformanceResponse,
  type AnalyticsRange,
  type AnalyticsSummary
} from '$lib/analytics/types';

function validRange(value: string | null): AnalyticsRange {
  return ANALYTICS_RANGES.some((range) => range.value === value)
    ? (value as AnalyticsRange)
    : '30d';
}

async function readJson<T>(fetch: typeof globalThis.fetch, path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Analytics request failed for ${path}.`);
  }
  return (await response.json()) as T;
}

export const load: PageServerLoad = async ({ fetch, url }) => {
  const range = validRange(url.searchParams.get('range'));
  const [summary, performance, drawdown, monthly, allocation, health] = await Promise.all([
    readJson<AnalyticsSummary>(fetch, '/api/analytics/summary'),
    readJson<AnalyticsPerformanceResponse>(fetch, `/api/analytics/performance?range=${range}`),
    readJson<AnalyticsDrawdownResponse>(fetch, `/api/analytics/drawdown?range=${range}`),
    readJson<AnalyticsMonthlyResponse>(fetch, '/api/analytics/monthly'),
    readJson<AnalyticsAllocationResponse>(fetch, '/api/analytics/allocation'),
    readJson<AnalyticsHealthSummary>(fetch, '/api/analytics/health')
  ]);

  return {
    range,
    ranges: ANALYTICS_RANGES,
    summary,
    performance,
    drawdown,
    monthly,
    allocation,
    health
  };
};
