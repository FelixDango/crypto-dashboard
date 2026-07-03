import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function getDatabasePath() {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'krypto.db');
}

export function openDatabase() {
  const databasePath = getDatabasePath();
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
}

export function runMigrations(db) {
  const migrationDirectory = path.join(process.cwd(), 'src', 'lib', 'server', 'db', 'migrations');
  if (!existsSync(migrationDirectory)) {
    throw new Error(`Migration directory not found: ${migrationDirectory}`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare('SELECT hash FROM __drizzle_migrations')
      .all()
      .map((row) => row.hash)
  );

  const files = readdirSync(migrationDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationDirectory, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
        file,
        Date.now()
      );
    })();
    console.log(`Applied migration ${file}`);
  }
}
