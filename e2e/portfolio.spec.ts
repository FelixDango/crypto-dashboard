import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import path from 'node:path';

function e2eDatabase(): Database.Database {
  const declared = process.env.E2E_DATABASE_PATH;
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.E2E_TEST_MODE !== '1' ||
    !declared ||
    path.resolve(declared) !== path.resolve(process.env.DATABASE_PATH ?? '') ||
    !path.resolve(declared).includes(`${path.sep}krypto-dashboard-e2e-`)
  ) {
    throw new Error('Refusing to open an unguarded E2E database.');
  }
  const sqlite = new Database(declared);
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function gotoApp(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true', { timeout: 20_000 });
}

async function chooseBitcoin(dialog: ReturnType<Page['getByRole']>): Promise<void> {
  const search = dialog.getByRole('combobox', { name: 'Coin' });
  await search.fill('BTC');
  await dialog.getByRole('option', { name: /BTC.*Bitcoin/i }).click();
}

async function addTransaction(
  page: Page,
  input: {
    type?: 'buy' | 'sell';
    quantity?: string;
    fiatAmount?: string;
    date?: string;
    notes?: string;
  } = {}
): Promise<void> {
  await gotoApp(page, '/transactions');
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add transaction' });
  await chooseBitcoin(dialog);
  await dialog.getByLabel('Type').selectOption(input.type ?? 'buy');
  await dialog.getByLabel('Date').fill(input.date ?? todayUtc());
  await dialog.getByLabel('Quantity').fill(input.quantity ?? '1');
  await dialog.getByLabel('Fiat amount').fill(input.fiatAmount ?? '100');
  if (input.notes) await dialog.getByLabel('Notes').fill(input.notes);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Transaction saved.');
}

function seedNewsAndHistory(suffix: string): void {
  const sqlite = e2eDatabase();
  const timestamp = new Date().toISOString();
  try {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO news_articles (
          id, source_id, url, title, fetched_at, sentiment_label, created_at, updated_at
        ) VALUES (?, 'coindesk', ?, 'E2E article', ?, 'neutral', ?, ?)`
      )
      .run(
        `e2e-article-${suffix}`,
        `https://example.com/e2e-${suffix}`,
        timestamp,
        timestamp,
        timestamp
      );
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO news_article_asset_matches (
          id, article_id, asset_id, match_type, confidence, matched_terms_json, created_at
        ) VALUES (?, ?, 'coingecko:bitcoin', 'symbol', 1, '["BTC"]', ?)`
      )
      .run(`e2e-match-${suffix}`, `e2e-article-${suffix}`, timestamp);
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO news_fetch_events (
          id, source_id, status, articles_found, articles_inserted, articles_updated,
          started_at, finished_at, created_at
        ) VALUES (?, 'coindesk', 'success', 1, 1, 0, ?, ?, ?)`
      )
      .run(`e2e-fetch-${suffix}`, timestamp, timestamp, timestamp);
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO market_daily_points (
          id, asset_id, base_currency, day, close, source, captured_at
        ) VALUES (?, 'coingecko:bitcoin', 'EUR', ?, '100', 'e2e', ?)`
      )
      .run(`e2e-market-${suffix}`, todayUtc(), timestamp);
  } finally {
    sqlite.close();
  }
}

function seedSnapshots(): void {
  const sqlite = e2eDatabase();
  const timestamp = new Date();
  const hourly = new Date(
    Date.UTC(
      timestamp.getUTCFullYear(),
      timestamp.getUTCMonth(),
      timestamp.getUTCDate(),
      timestamp.getUTCHours()
    )
  ).toISOString();
  const daily = new Date(
    Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), timestamp.getUTCDate())
  ).toISOString();
  const insert = sqlite.prepare(
    `INSERT OR REPLACE INTO portfolio_snapshots (
      id, snapshot_type, base_currency, bucket_at, total_value, total_invested,
      unrealized_profit, roi_percent, holdings_json, prices_json, price_status, captured_at, created_at
    ) VALUES (?, ?, 'EUR', ?, '250', '200', '50', '25', '[]', '[]', 'fresh', ?, ?)`
  );
  try {
    insert.run('e2e-hourly', 'hourly', hourly, hourly, hourly);
    insert.run('e2e-daily', 'daily', daily, daily, daily);
  } finally {
    sqlite.close();
  }
}

function tableCount(table: 'transactions' | 'news_articles' | 'settings'): number {
  const sqlite = e2eDatabase();
  try {
    return (sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number })
      .count;
  } finally {
    sqlite.close();
  }
}

async function performReset(page: Page, scope: 'portfolio' | 'full'): Promise<void> {
  await gotoApp(page, '/settings');
  const dangerZone = page.getByTestId('danger-zone');
  await dangerZone.locator('summary').click();
  await expect(dangerZone.getByRole('link', { name: 'Download' })).toBeVisible();
  await dangerZone
    .getByLabel(scope === 'portfolio' ? 'Portfolio and planning' : 'Full historical data')
    .check();
  await expect(dangerZone.getByTestId('reset-preview')).toContainText('rows will be deleted');
  const submit = dangerZone.getByTestId('reset-submit');
  await expect(submit).toBeDisabled();
  await dangerZone.getByLabel('I understand this permanently deletes the listed data.').check();
  await dangerZone.getByLabel('Type DELETE ALL TEST DATA').fill('DELETE ALL TEST DATA');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL(/\/dashboard\?reset=complete$/);
  await expect(page.getByTestId('reset-success')).toContainText('Reset complete');
  await expect(
    page.getByRole('heading', { name: 'Start with your first transaction' })
  ).toBeVisible();
}

test.describe.serial('private portfolio smoke flow', () => {
  test('creates, edits, and deletes a manual transaction', async ({ page }) => {
    await addTransaction(page, { notes: 'created in browser test' });
    const row = page.locator('tbody tr').filter({ hasText: 'BTC' }).first();
    await row.getByLabel('Edit BTC transaction').click();
    const edit = page.getByRole('dialog', { name: 'Edit transaction' });
    await edit.getByLabel('Notes').fill('edited in browser test');
    await edit.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Transaction updated.');

    await row.getByLabel('Edit BTC transaction').click();
    const persistedEdit = page.getByRole('dialog', { name: 'Edit transaction' });
    await expect(persistedEdit.getByLabel('Notes')).toHaveValue('edited in browser test');
    await persistedEdit.getByRole('button', { name: 'Cancel' }).click();

    await page
      .locator('tbody tr')
      .filter({ hasText: 'BTC' })
      .first()
      .getByLabel('Delete BTC transaction')
      .click();
    await page
      .getByRole('dialog', { name: 'Delete transaction' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('Transaction deleted.');
    await expect(page.getByRole('heading', { name: 'No activity yet' })).toBeVisible();
  });

  test('closes and reopens a position, rejects the future, renders missing ROI and analytics, and exports CSV', async ({
    page
  }) => {
    await addTransaction(page, { quantity: '1', fiatAmount: '100' });
    await addTransaction(page, { type: 'sell', quantity: '1', fiatAmount: '150' });
    seedSnapshots();
    await gotoApp(page, '/dashboard');
    await expect(page.getByLabel('Portfolio summary')).toContainText('50.00%');

    await addTransaction(page, { quantity: '1', fiatAmount: '200' });
    await gotoApp(page, '/dashboard');
    await expect(page.getByLabel('Portfolio summary')).not.toContainText('%');
    await expect(page.locator('[aria-label="Portfolio value chart"]')).toBeVisible();
    await gotoApp(page, '/analytics');
    await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible();
    await expect(page.getByText('1 portfolio value points are shown.')).toBeVisible();

    await gotoApp(page, '/transactions');
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    const futureDialog = page.getByRole('dialog', { name: 'Add transaction' });
    await chooseBitcoin(futureDialog);
    await futureDialog.getByLabel('Date').fill('2099-01-01');
    await futureDialog.getByLabel('Quantity').fill('1');
    await futureDialog.getByLabel('Fiat amount').fill('100');
    await futureDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(futureDialog.getByRole('alert')).toContainText('cannot be later than today (UTC)');
    await futureDialog.getByRole('button', { name: 'Cancel' }).click();

    await page.getByLabel('More activity actions').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Export CSV', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/transactions.*\.csv/i);
  });

  test('runs Scope A without deleting news or settings', async ({ page }) => {
    seedNewsAndHistory('scope-a');
    const settingsBefore = tableCount('settings');
    await performReset(page, 'portfolio');
    expect(tableCount('transactions')).toBe(0);
    expect(tableCount('news_articles')).toBe(1);
    expect(tableCount('settings')).toBe(settingsBefore);
  });

  test('runs Scope B and removes historical caches while preserving settings', async ({ page }) => {
    await addTransaction(page, { quantity: '1', fiatAmount: '100' });
    seedNewsAndHistory('scope-b');
    const settingsBefore = tableCount('settings');
    await performReset(page, 'full');
    expect(tableCount('transactions')).toBe(0);
    expect(tableCount('news_articles')).toBe(0);
    expect(tableCount('settings')).toBe(settingsBefore);
  });

  test('keeps primary navigation usable at a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/dashboard');
    const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(navigation.getByLabel('Settings')).toBeVisible();
    await navigation.getByLabel('Activity').click();
    await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
