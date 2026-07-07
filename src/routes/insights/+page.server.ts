import type { PageServerLoad } from './$types';
import { getAnalyticsAllocation, getAnalyticsSummary } from '$lib/server/analytics/service';
import { getDataConfidence } from '$lib/server/insights/data-confidence';
import {
  explainCycleContext,
  explainDataHealth,
  explainPortfolioMove,
  explainRiskState,
  type ExplainRange
} from '$lib/server/insights/explain';
import { generateCycleWindows, getCycleProgress } from '$lib/server/insights/market-cycle';
import { getPortfolioNewsContext } from '$lib/server/news/context';
import { getNewsHealth } from '$lib/server/news/health';

const ranges: { value: ExplainRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' }
];

function validRange(value: string | null): ExplainRange {
  return ranges.some((range) => range.value === value) ? (value as ExplainRange) : '24h';
}

export const load: PageServerLoad = async ({ url }) => {
  const range = validRange(url.searchParams.get('range'));
  const now = new Date();
  const [
    summary,
    allocation,
    confidence,
    move,
    dataHealth,
    risk,
    cycleExplain,
    newsContext,
    newsHealth
  ] = await Promise.all([
    getAnalyticsSummary({ now }),
    getAnalyticsAllocation(),
    getDataConfidence({ now }),
    explainPortfolioMove(range, { now }),
    explainDataHealth({ now }),
    explainRiskState({ now }),
    explainCycleContext({ now }),
    getPortfolioNewsContext(range, { now }),
    Promise.resolve(getNewsHealth({ now }))
  ]);

  return {
    range,
    ranges,
    summary,
    allocation,
    confidence,
    explain: {
      move,
      dataHealth,
      risk,
      cycle: cycleExplain
    },
    newsContext,
    newsHealth,
    cycle: getCycleProgress(now),
    cycleWindows: generateCycleWindows(
      new Date('2022-11-08T00:00:00.000Z'),
      new Date('2034-08-03T00:00:00.000Z')
    )
  };
};
