import type { PageServerLoad } from './$types';
import { getPortfolioOverviewContext } from '$lib/server/portfolio/service';
import {
  ensureInitialPortfolioSnapshot,
  parseSnapshotRange,
  SNAPSHOT_RANGES
} from '$lib/server/portfolio/snapshots';
import { getPortfolioPlanning } from '$lib/server/planning/service';
import { RESET_CATEGORY_LABELS, resetCategories, type ResetResult } from '$lib/server/reset';
import { getAnalyticsSummary } from '$lib/server/analytics/service';

export const load: PageServerLoad = async ({ url, cookies }) => {
  const snapshotRange = parseSnapshotRange(url.searchParams.get('range') ?? '30d');
  await ensureInitialPortfolioSnapshot();
  const { overview, normalizedTransactions } = await getPortfolioOverviewContext({ snapshotRange });
  let resetResult: null | {
    scope: ResetResult['scope'];
    totalRows: number;
    deletedCategories: Array<{ label: string; count: number }>;
  } = null;
  const resetCookie = cookies.get('reset_result');
  if (url.searchParams.get('reset') === 'complete' && resetCookie) {
    try {
      const result = JSON.parse(
        Buffer.from(resetCookie, 'base64url').toString('utf8')
      ) as ResetResult;
      if (result.scope === 'portfolio' || result.scope === 'full') {
        resetResult = {
          scope: result.scope,
          totalRows: result.totalRows,
          deletedCategories: resetCategories(result.scope).map((category) => ({
            label: RESET_CATEGORY_LABELS[category],
            count: result.counts[category]
          }))
        };
      }
    } catch {
      resetResult = null;
    }
    cookies.delete('reset_result', { path: '/' });
  }

  const [planning, analyticsSummary] = await Promise.all([
    getPortfolioPlanning(overview),
    getAnalyticsSummary({
      baseCurrency: overview.totals.baseCurrency,
      overview,
      normalizedTransactions
    })
  ]);

  return {
    overview,
    hasTransactions: normalizedTransactions.length > 0,
    resetResult,
    planning,
    analyticsSummary,
    snapshotRange,
    snapshotRanges: SNAPSHOT_RANGES
  };
};
