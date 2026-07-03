import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const csv = `type,asset_provider,asset_provider_coin_id,asset_symbol,asset_name,quantity,fiat_amount,fiat_currency,fee_amount,fee_currency,transaction_date,notes
buy,coingecko,bitcoin,BTC,Bitcoin,0.1,1000,EUR,1,EUR,2025-01-01,first
buy,coingecko,bitcoin,BTC,Bitcoin,0.1,1000,EUR,1,EUR,2025-01-01,first
`;

describe('CSV import', () => {
  beforeEach(() => {
    vi.resetModules();
    const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-csv-'));
    process.env.DATABASE_PATH = path.join(dir, 'test.db');
  });

  it('previews duplicates and imports ready rows as one batch', async () => {
    const { importTransactionsFromCsv, previewTransactionsCsv } =
      await import('../src/lib/server/csv');
    const { listTransactions } = await import('../src/lib/server/transactions');

    const preview = previewTransactionsCsv(csv);
    expect(preview.totalRows).toBe(2);
    expect(preview.importableRows).toBe(1);
    expect(preview.duplicateRows).toBe(1);

    const result = importTransactionsFromCsv(csv, 'sample.csv');
    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(listTransactions()).toHaveLength(1);

    const secondPreview = previewTransactionsCsv(csv);
    expect(secondPreview.importableRows).toBe(0);
    expect(secondPreview.duplicateRows).toBe(2);
  });
});
