import { json, type RequestEvent } from '@sveltejs/kit';
import type { PortfolioSnapshotType } from '$lib/types';
import { isInternalCronAuthorized } from '$lib/server/internalAuth';
import { createPortfolioSnapshot } from './snapshots';

export async function createInternalSnapshotResponse(
  event: RequestEvent,
  snapshotType: PortfolioSnapshotType
) {
  if (!isInternalCronAuthorized(event.request)) {
    return json({ status: 'unauthorized' }, { status: 401 });
  }

  const snapshot = await createPortfolioSnapshot(snapshotType);
  return json({
    status: 'ok',
    snapshotType: snapshot.snapshotType,
    bucket: snapshot.bucket,
    result: snapshot.result,
    snapshot: {
      id: snapshot.snapshot.id,
      priceStatus: snapshot.snapshot.priceStatus,
      capturedAt: snapshot.snapshot.capturedAt
    }
  });
}
