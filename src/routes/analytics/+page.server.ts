import type { PageServerLoad } from './$types';
import { ANALYTICS_RANGES, type AnalyticsRange } from '$lib/analytics/types';
import { generateCycleWindows, getCycleProgress } from '$lib/server/insights/market-cycle';
import {
  getAnalyticsAllocation,
  getAnalyticsDrawdown,
  getAnalyticsMonthly,
  getAnalyticsPerformance,
  getAnalyticsSummary
} from '$lib/server/analytics/service';
import { getAnalyticsHealthSummary, getPriceHealth } from '$lib/server/analytics/history-health';
import { getPortfolioOverviewContext } from '$lib/server/portfolio/service';

function validRange(value: string | null): AnalyticsRange {
  return ANALYTICS_RANGES.some((range) => range.value === value)
    ? (value as AnalyticsRange)
    : '30d';
}

export const load: PageServerLoad = async ({ url }) => {
  const range = validRange(url.searchParams.get('range'));
  const { overview, normalizedTransactions } = await getPortfolioOverviewContext();
  const baseCurrency = overview.totals.baseCurrency;
  const priceHealth = await getPriceHealth({ baseCurrency, normalizedTransactions });
  const [summary, monthly, allocation, health] = await Promise.all([
    getAnalyticsSummary({ baseCurrency, overview, normalizedTransactions }),
    getAnalyticsMonthly({ baseCurrency, normalizedTransactions }),
    getAnalyticsAllocation({ baseCurrency, overview, priceHealth }),
    getAnalyticsHealthSummary({ baseCurrency, normalizedTransactions, priceHealth })
  ]);
  const performance = getAnalyticsPerformance(range, { baseCurrency });
  const drawdown = getAnalyticsDrawdown(range, { baseCurrency });

  return {
    range,
    ranges: ANALYTICS_RANGES,
    summary,
    performance,
    drawdown,
    monthly,
    allocation,
    health,
    cycle: getCycleProgress(new Date()),
    cycleWindows: generateCycleWindows(
      new Date('2022-11-08T00:00:00.000Z'),
      new Date('2038-07-02T00:00:00.000Z')
    )
  };
};
