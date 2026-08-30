import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as schema from './schema';
import { runMigrations } from './migrate';

let sqlite: Database.Database | null = null;

export function getDatabasePath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'krypto.db');
}

function assertSafeE2EDatabasePath(databasePath: string): void {
  if (process.env.E2E_TEST_MODE !== '1') return;
  const declared = process.env.E2E_DATABASE_PATH;
  const resolved = path.resolve(databasePath);
  const temporaryRoot = path.resolve(tmpdir());
  if (
    process.env.NODE_ENV !== 'test' ||
    !declared ||
    resolved !== path.resolve(declared) ||
    !resolved.startsWith(`${temporaryRoot}${path.sep}`) ||
    !resolved.includes(`${path.sep}krypto-dashboard-e2e-`)
  ) {
    throw new Error('E2E database guard refused a non-temporary database path.');
  }
}

export function getSqlite(): Database.Database {
  if (sqlite) return sqlite;

  const databasePath = getDatabasePath();
  assertSafeE2EDatabasePath(databasePath);
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  sqlite = new Database(databasePath);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  runMigrations(sqlite);
  return sqlite;
}

export const db = drizzle(getSqlite(), { schema });
