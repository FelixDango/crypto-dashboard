import type Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const migrationTable = '__drizzle_migrations';

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
      created_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    sqlite
      .prepare(`SELECT hash FROM ${migrationTable}`)
      .all()
      .map((row) => {
        const value = row as { hash: string };
        return value.hash;
      })
  );

  const migrationDirectory = getMigrationDirectory();
  const files = readdirSync(migrationDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationDirectory, file), 'utf8');
    const transaction = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite
        .prepare(`INSERT INTO ${migrationTable} (hash, created_at) VALUES (?, ?)`)
        .run(file, Date.now());
    });
    transaction();
  }
}
