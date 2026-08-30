import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import path from 'node:path';

const databasePath = process.env.E2E_DATABASE_PATH;
const resolvedDatabasePath = databasePath ? path.resolve(databasePath) : '';
const temporaryRoot = path.resolve(tmpdir());

if (
  process.env.NODE_ENV !== 'test' ||
  process.env.E2E_TEST_MODE !== '1' ||
  !databasePath ||
  process.env.DATABASE_PATH !== databasePath ||
  !resolvedDatabasePath.startsWith(`${temporaryRoot}${path.sep}`) ||
  !resolvedDatabasePath.includes(`${path.sep}krypto-dashboard-e2e-`)
) {
  throw new Error('Playwright requires a guarded temporary E2E database. Use npm run test:e2e.');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'npm run dev -- --port 4173',
    url: 'http://127.0.0.1:4173/health',
    reuseExistingServer: false,
    timeout: 120_000
  }
});
