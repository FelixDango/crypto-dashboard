import { createVerifiedBackup, readBackupFile } from '$lib/server/backup';

export async function GET() {
  const backup = await createVerifiedBackup();
  const body = Uint8Array.from(readBackupFile(backup)).buffer;

  return new Response(body, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${backup.filename}"`,
      'x-backup-integrity': backup.integrity
    }
  });
}
