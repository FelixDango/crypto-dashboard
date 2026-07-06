import { json } from '@sveltejs/kit';
import { getDataConfidence } from '$lib/server/insights/data-confidence';
import {
  explainCycleContext,
  explainDataHealth,
  explainPortfolioMove,
  explainRiskState
} from '$lib/server/insights/explain';
import {
  getActiveCycleSettings,
  getCycleProgress,
  getNextCycleTransition
} from '$lib/server/insights/market-cycle';

export async function GET() {
  const now = new Date();
  const [confidence, move, dataHealth, risk, cycleExplain] = await Promise.all([
    getDataConfidence({ now }),
    explainPortfolioMove('24h', { now }),
    explainDataHealth({ now }),
    explainRiskState({ now }),
    explainCycleContext({ now })
  ]);

  return json({
    generatedAt: now.toISOString(),
    confidence,
    explain: {
      move,
      dataHealth,
      risk,
      cycle: cycleExplain
    },
    cycle: {
      settings: getActiveCycleSettings(),
      progress: getCycleProgress(now),
      nextTransition: getNextCycleTransition(now)
    }
  });
}
