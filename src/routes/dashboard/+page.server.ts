import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getPortfolioOverview } from '$lib/server/portfolio/service';
import {
  createPortfolioSnapshot,
  ensureInitialPortfolioSnapshot,
  parseSnapshotRange,
  SNAPSHOT_RANGES
} from '$lib/server/portfolio/snapshots';
import { generateCycleWindows, getCycleProgress } from '$lib/server/insights/market-cycle';
import { getPortfolioPlanning } from '$lib/server/planning/service';
import { RESET_CATEGORY_LABELS, resetCategories, type ResetResult } from '$lib/server/reset';

export const load: PageServerLoad = async ({ url, cookies }) => {
  const snapshotRange = parseSnapshotRange(url.searchParams.get('range'));
  await ensureInitialPortfolioSnapshot();
  const overview = await getPortfolioOverview({ snapshotRange });
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

  return {
    overview,
    resetResult,
    planning: await getPortfolioPlanning(overview),
    cycle: getCycleProgress(new Date()),
    cycleWindows: generateCycleWindows(
      new Date('2022-11-08T00:00:00.000Z'),
      new Date('2038-07-02T00:00:00.000Z')
    ),
    snapshotRange,
    snapshotRanges: SNAPSHOT_RANGES
  };
};

export const actions: Actions = {
  createSnapshot: async () => {
    try {
      const snapshot = await createPortfolioSnapshot('hourly');
      return {
        snapshotResult: snapshot.result,
        snapshotBucket: snapshot.bucket
      };
    } catch (error) {
      return fail(500, {
        snapshotError:
          error instanceof Error ? error.message : 'Snapshot creation failed. Please try again.'
      });
    }
  }
};
