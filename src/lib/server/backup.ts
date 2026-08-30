import Database from 'better-sqlite3';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync
} from 'node:fs';
import path from 'node:path';
import { getDatabasePath, getSqlite } from '$lib/server/db/client';

const APPLICATION_BACKUP_PATTERN = /^krypto-dashboard-backup-\d{8}T\d{9}Z\.db$/;
const DEFAULT_RETENTION_COUNT = 14;
const DEFAULT_RETENTION_DAYS = 30;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export type BackupConfig = {
  directory: string;
  retentionCount: number;
  retentionDays: number;
};

export function getBackupConfig(): BackupConfig {
  return {
    directory: path.resolve(process.env.BACKUP_DIRECTORY ?? path.join(process.cwd(), 'backups')),
    retentionCount: positiveInteger(process.env.BACKUP_RETENTION_COUNT, DEFAULT_RETENTION_COUNT),
    retentionDays: positiveInteger(process.env.BACKUP_RETENTION_DAYS, DEFAULT_RETENTION_DAYS)
  };
}

function timestampForFilename(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, '');
}

function assertSeparateBackupDirectory(directory: string, databasePath: string): void {
  const backupDirectory = path.resolve(directory);
  const databaseDirectory = path.dirname(path.resolve(databasePath));
  if (backupDirectory === databaseDirectory) {
    throw new Error('BACKUP_DIRECTORY must be outside the live database directory.');
  }
}

function integrityCheck(databasePath: string): void {
  const backup = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const result = backup.pragma('integrity_check', { simple: true });
    if (result !== 'ok') throw new Error(`Backup integrity check failed: ${String(result)}`);
  } finally {
    backup.close();
  }
}

export type BackupPruneResult = {
  deleted: number;
  retained: number;
};

export function pruneApplicationBackups(
  config: BackupConfig = getBackupConfig(),
  now: Date = new Date()
): BackupPruneResult {
  mkdirSync(config.directory, { recursive: true });
  const directory = path.resolve(config.directory);
  const cutoffMs = now.getTime() - config.retentionDays * 24 * 60 * 60 * 1000;
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && APPLICATION_BACKUP_PATTERN.test(entry.name))
    .map((entry) => {
      const filePath = path.resolve(directory, entry.name);
      if (!filePath.startsWith(`${directory}${path.sep}`)) {
        throw new Error('Refusing to prune a backup outside BACKUP_DIRECTORY.');
      }
      return { name: entry.name, path: filePath, modifiedAt: statSync(filePath).mtimeMs };
    })
    .sort(
      (left, right) => right.modifiedAt - left.modifiedAt || right.name.localeCompare(left.name)
    );

  let deleted = 0;
  for (const [index, file] of files.entries()) {
    if (index >= config.retentionCount || file.modifiedAt < cutoffMs) {
      unlinkSync(file.path);
      deleted += 1;
    }
  }

  return { deleted, retained: files.length - deleted };
}

export type CreatedBackup = {
  filename: string;
  path: string;
  sizeBytes: number;
  integrity: 'ok';
  createdAt: string;
  prune: BackupPruneResult;
};

export async function createVerifiedBackup(
  options: {
    sqlite?: Database.Database;
    databasePath?: string;
    config?: BackupConfig;
    now?: Date;
  } = {}
): Promise<CreatedBackup> {
  const sqlite = options.sqlite ?? getSqlite();
  const databasePath = options.databasePath ?? getDatabasePath();
  const config = options.config ?? getBackupConfig();
  const now = options.now ?? new Date();
  assertSeparateBackupDirectory(config.directory, databasePath);
  mkdirSync(config.directory, { recursive: true });

  const filename = `krypto-dashboard-backup-${timestampForFilename(now)}.db`;
  const destination = path.resolve(config.directory, filename);
  const temporary = `${destination}.partial-${process.pid}`;
  if (!destination.startsWith(`${path.resolve(config.directory)}${path.sep}`)) {
    throw new Error('Refusing to create a backup outside BACKUP_DIRECTORY.');
  }

  try {
    await sqlite.backup(temporary);
    integrityCheck(temporary);
    renameSync(temporary, destination);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }

  const prune = pruneApplicationBackups(config, now);
  return {
    filename,
    path: destination,
    sizeBytes: statSync(destination).size,
    integrity: 'ok',
    createdAt: now.toISOString(),
    prune
  };
}

export function readBackupFile(backup: CreatedBackup): Buffer {
  return readFileSync(backup.path);
}
