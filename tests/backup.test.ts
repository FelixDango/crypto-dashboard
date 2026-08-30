import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('verified SQLite backups', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates an integrity-checked online backup from a WAL database', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-backup-'));
    const databasePath = path.join(directory, 'data', 'test.db');
    const backupDirectory = path.join(directory, 'backups');
    process.env.DATABASE_PATH = databasePath;
    const { getSqlite } = await import('../src/lib/server/db/client');
    const sqlite = getSqlite();
    sqlite.exec('CREATE TABLE backup_probe (value TEXT NOT NULL)');
    sqlite.prepare('INSERT INTO backup_probe (value) VALUES (?)').run('present-in-wal-safe-copy');
    const { createVerifiedBackup } = await import('../src/lib/server/backup');

    const result = await createVerifiedBackup({
      sqlite,
      databasePath,
      config: { directory: backupDirectory, retentionCount: 14, retentionDays: 30 },
      now: new Date('2026-08-30T01:30:00.123Z')
    });

    expect(result.filename).toBe('krypto-dashboard-backup-20260830T013000123Z.db');
    expect(result.integrity).toBe('ok');
    const restored = new Database(result.path, { readonly: true });
    expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(restored.prepare('SELECT value FROM backup_probe').get()).toEqual({
      value: 'present-in-wal-safe-copy'
    });
    restored.close();
  });

  it('rejects a backup directory beside the live database', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-backup-location-'));
    const databasePath = path.join(directory, 'test.db');
    process.env.DATABASE_PATH = databasePath;
    const { getSqlite } = await import('../src/lib/server/db/client');
    const { createVerifiedBackup } = await import('../src/lib/server/backup');

    await expect(
      createVerifiedBackup({
        sqlite: getSqlite(),
        databasePath,
        config: { directory, retentionCount: 14, retentionDays: 30 }
      })
    ).rejects.toThrow(/outside the live database directory/);
  });

  it('prunes only application-owned files by count and age', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-backup-prune-'));
    const now = new Date('2026-08-30T12:00:00.000Z');
    const names = [
      'krypto-dashboard-backup-20260830T010000000Z.db',
      'krypto-dashboard-backup-20260829T010000000Z.db',
      'krypto-dashboard-backup-20260828T010000000Z.db',
      'krypto-dashboard-backup-20260701T010000000Z.db'
    ];
    for (const [index, name] of names.entries()) {
      const file = path.join(directory, name);
      writeFileSync(file, `backup-${index}`);
      const ageDays = index === 3 ? 60 : index;
      const modified = new Date(now.getTime() - ageDays * 24 * 60 * 60 * 1000);
      utimesSync(file, modified, modified);
    }
    writeFileSync(path.join(directory, 'notes.txt'), 'do not delete');
    writeFileSync(path.join(directory, 'krypto-dashboard-backup-manual.db'), 'do not delete');
    process.env.DATABASE_PATH = path.join(directory, 'data', 'test.db');
    const { pruneApplicationBackups } = await import('../src/lib/server/backup');

    const result = pruneApplicationBackups(
      { directory, retentionCount: 2, retentionDays: 45 },
      now
    );

    expect(result).toEqual({ deleted: 2, retained: 2 });
    expect(
      readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort()
    ).toEqual([names[0], names[1], 'krypto-dashboard-backup-manual.db', 'notes.txt'].sort());
    expect(readFileSync(path.join(directory, 'notes.txt'), 'utf8')).toBe('do not delete');
  });

  it('protects the scheduled backup route with the internal cron secret', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-backup-route-'));
    const backupDirectory = path.join(directory, 'backups');
    process.env.DATABASE_PATH = path.join(directory, 'data', 'test.db');
    process.env.BACKUP_DIRECTORY = backupDirectory;
    process.env.INTERNAL_CRON_SECRET = 'test-secret';
    const { POST } = await import('../src/routes/api/internal/backups/run/+server');

    const unauthorized = await POST({
      request: new Request('http://app/api/internal/backups/run', { method: 'POST' })
    } as never);
    const authorized = await POST({
      request: new Request('http://app/api/internal/backups/run', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' }
      })
    } as never);
    const payload = (await authorized.json()) as {
      status: string;
      backup: { integrity: string; filename: string };
    };

    expect(unauthorized.status).toBe(401);
    expect(authorized.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.backup.integrity).toBe('ok');
    expect(readdirSync(backupDirectory)).toContain(payload.backup.filename);
  });
});
