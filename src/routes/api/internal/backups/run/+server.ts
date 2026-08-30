import { json, type RequestEvent } from '@sveltejs/kit';
import { createVerifiedBackup } from '$lib/server/backup';
import { isInternalCronAuthorized } from '$lib/server/internalAuth';

export async function POST(event: RequestEvent) {
  if (!isInternalCronAuthorized(event.request)) {
    return json({ status: 'unauthorized' }, { status: 401 });
  }

  const backup = await createVerifiedBackup();
  return json({
    status: 'ok',
    backup: {
      filename: backup.filename,
      sizeBytes: backup.sizeBytes,
      integrity: backup.integrity,
      createdAt: backup.createdAt,
      pruned: backup.prune.deleted,
      retained: backup.prune.retained
    }
  });
}
