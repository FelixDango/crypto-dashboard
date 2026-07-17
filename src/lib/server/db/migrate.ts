import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const migrationTable = '__drizzle_migrations';

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

function getMigrationDirectory(): string {
  const candidates = [
    path.join(process.cwd(), 'src', 'lib', 'server', 'db', 'migrations'),
    path.join(process.cwd(), 'migrations')
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('No database migration directory found.');
  }
  return found;
}

export function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ${migrationTable} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      checksum TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  const migrationColumns = sqlite.prepare(`PRAGMA table_info(${migrationTable})`).all() as Array<{
    name: string;
  }>;
  if (!migrationColumns.some((column) => column.name === 'checksum')) {
    sqlite.exec(`ALTER TABLE ${migrationTable} ADD COLUMN checksum TEXT`);
  }

  const applied = new Map(
    sqlite
      .prepare(`SELECT hash, checksum FROM ${migrationTable}`)
      .all()
      .map((row) => {
        const value = row as { hash: string; checksum: string | null };
        return [value.hash, value.checksum] as const;
      })
  );

  const migrationDirectory = getMigrationDirectory();
  const files = readdirSync(migrationDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const sql = readFileSync(path.join(migrationDirectory, file), 'utf8');
    const currentChecksum = checksum(sql);
    const appliedChecksum = applied.get(file);
    if (applied.has(file)) {
      if (appliedChecksum && appliedChecksum !== currentChecksum) {
        throw new Error(`Applied migration ${file} has been modified.`);
      }
      if (!appliedChecksum) {
        sqlite
          .prepare(`UPDATE ${migrationTable} SET checksum = ? WHERE hash = ?`)
          .run(currentChecksum, file);
      }
      continue;
    }
    const transaction = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite
        .prepare(`INSERT INTO ${migrationTable} (hash, checksum, created_at) VALUES (?, ?, ?)`)
        .run(file, currentChecksum, Date.now());
    });
    transaction();
  }
}
