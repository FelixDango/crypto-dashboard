import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import * as schema from './schema';
import { runMigrations } from './migrate';

let sqlite: Database.Database | null = null;

export function getDatabasePath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'krypto.db');
}

export function getSqlite(): Database.Database {
  if (sqlite) return sqlite;

  const databasePath = getDatabasePath();
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
