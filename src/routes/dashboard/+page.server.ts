import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getPortfolioOverview } from '$lib/server/portfolio/service';
import {
  createPortfolioSnapshot,
  ensureInitialPortfolioSnapshot,
  parseSnapshotRange,
  SNAPSHOT_RANGES
} from '$lib/server/portfolio/snapshots';

export const load: PageServerLoad = async ({ url }) => {
  const snapshotRange = parseSnapshotRange(url.searchParams.get('range'));
  await ensureInitialPortfolioSnapshot();

  return {
    overview: await getPortfolioOverview({ snapshotRange }),
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
