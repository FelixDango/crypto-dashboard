import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
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
      checksum TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  const migrationColumns = db.prepare('PRAGMA table_info(__drizzle_migrations)').all();
  if (!migrationColumns.some((column) => column.name === 'checksum')) {
    db.exec('ALTER TABLE __drizzle_migrations ADD COLUMN checksum TEXT');
  }

  const applied = new Map(
    db
      .prepare('SELECT hash, checksum FROM __drizzle_migrations')
      .all()
      .map((row) => [row.hash, row.checksum])
  );

  const files = readdirSync(migrationDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const sql = readFileSync(path.join(migrationDirectory, file), 'utf8');
    const currentChecksum = createHash('sha256').update(sql).digest('hex');
    const appliedChecksum = applied.get(file);
    if (applied.has(file)) {
      if (appliedChecksum && appliedChecksum !== currentChecksum) {
        throw new Error(`Applied migration ${file} has been modified.`);
      }
      if (!appliedChecksum) {
        db.prepare('UPDATE __drizzle_migrations SET checksum = ? WHERE hash = ?').run(
          currentChecksum,
          file
        );
      }
      continue;
    }
    db.transaction(() => {
      db.exec(sql);
      db.prepare(
        'INSERT INTO __drizzle_migrations (hash, checksum, created_at) VALUES (?, ?, ?)'
      ).run(file, currentChecksum, Date.now());
    })();
    console.log(`Applied migration ${file}`);
  }
}
