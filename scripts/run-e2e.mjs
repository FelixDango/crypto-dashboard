import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const temporaryRoot = path.resolve(tmpdir());
const directory = mkdtempSync(path.join(temporaryRoot, 'krypto-dashboard-e2e-'));
const databasePath = path.join(directory, 'e2e.db');
const playwrightCli = path.resolve('node_modules', '@playwright', 'test', 'cli.js');

const environment = {
  ...process.env,
  NODE_ENV: 'test',
  E2E_TEST_MODE: '1',
  E2E_DATABASE_PATH: databasePath,
  DATABASE_PATH: databasePath,
  BACKUP_DIRECTORY: path.join(directory, 'backups'),
  BASE_CURRENCY: 'EUR',
  PRICE_PROVIDER: 'coingecko',
  INTERNAL_CRON_SECRET: 'e2e-only-secret'
};

let exitCode = 1;
try {
  const result = spawnSync(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit'
  });
  exitCode = result.status ?? 1;
} finally {
  const resolved = path.resolve(directory);
  if (
    resolved.startsWith(`${temporaryRoot}${path.sep}`) &&
    path.basename(resolved).startsWith('krypto-dashboard-e2e-')
  ) {
    rmSync(resolved, { recursive: true, force: true });
  }
}

process.exit(exitCode);
