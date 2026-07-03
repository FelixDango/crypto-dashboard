import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import type { Currency, TransactionRecord } from '$lib/types';
import { transactionInputSchema } from '$lib/validation/transaction';
import { db, getSqlite } from './db/client';
import { importBatches, transactions } from './db/schema';
import { createTransaction } from './transactions';

const headers = [
  'type',
  'asset_provider',
  'asset_provider_coin_id',
  'asset_symbol',
  'asset_name',
  'quantity',
  'fiat_amount',
  'fiat_currency',
  'fee_amount',
  'fee_currency',
  'transaction_date',
  'notes'
];

function safeCell(value: string | null | undefined): string {
  const cleaned = (value ?? '').replace(/\0/g, '').slice(0, 1000);
  return /^[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

type ParsedCsvRow = {
  index: number;
  input: ReturnType<typeof transactionInputSchema.parse>;
  hash: string;
};

export type CsvPreviewRow = {
  index: number;
  type: string;
  assetSymbol: string;
  assetName: string;
  quantity: string;
  fiatAmount: string;
  fiatCurrency: Currency;
  transactionDate: string;
  duplicate: boolean;
};

export type CsvPreview = {
  totalRows: number;
  importableRows: number;
  duplicateRows: number;
  rows: CsvPreviewRow[];
};

function transactionHash(input: ParsedCsvRow['input']): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        asset: input.asset,
        type: input.type,
        quantity: input.quantity,
        fiatAmount: input.fiatAmount,
        fiatCurrency: input.fiatCurrency,
        feeAmount: input.feeAmount,
        feeCurrency: input.feeCurrency,
        transactionDate: input.transactionDate,
        notes: input.notes
      })
    )
    .digest('hex');
}

function rowIsDuplicate(hash: string): boolean {
  return (
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.rowHash, hash))
      .limit(1)
      .get() !== undefined
  );
}

function parseTransactionsCsv(content: string): ParsedCsvRow[] {
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    max_record_size: 20_000
  }) as Record<string, string>[];

  if (rows.length > 5000) {
    throw new Error('CSV import is limited to 5,000 rows at a time.');
  }

  return rows.map((row, index) => {
    const input = transactionInputSchema.parse({
      asset: {
        provider: safeCell(row.asset_provider || 'coingecko'),
        providerCoinId: safeCell(row.asset_provider_coin_id),
        symbol: safeCell(row.asset_symbol),
        name: safeCell(row.asset_name),
        imageUrl: ''
      },
      type: row.type,
      quantity: row.quantity,
      fiatAmount: row.fiat_amount,
      fiatCurrency: row.fiat_currency,
      feeAmount: row.fee_amount || null,
      feeCurrency: row.fee_currency || row.fiat_currency,
      transactionDate: row.transaction_date,
      notes: safeCell(row.notes)
    });

    return {
      index: index + 1,
      input,
      hash: transactionHash(input)
    };
  });
}

export function exportTransactionsToCsv(transactions: TransactionRecord[]): string {
  const records = transactions.map((transaction) => ({
    type: transaction.type,
    asset_provider: transaction.assetId.split(':')[0] ?? 'coingecko',
    asset_provider_coin_id: transaction.assetId.split(':').slice(1).join(':'),
    asset_symbol: safeCell(transaction.assetSymbol),
    asset_name: safeCell(transaction.assetName),
    quantity: transaction.quantity,
    fiat_amount: transaction.fiatAmount,
    fiat_currency: transaction.fiatCurrency,
    fee_amount: transaction.feeAmount ?? '',
    fee_currency: transaction.feeCurrency ?? '',
    transaction_date: transaction.transactionDate,
    notes: safeCell(transaction.notes)
  }));

  return stringify(records, { header: true, columns: headers });
}

export function previewTransactionsCsv(content: string): CsvPreview {
  const parsed = parseTransactionsCsv(content);
  const seen = new Set<string>();
  let duplicateRows = 0;

  const rows = parsed.map((row) => {
    const duplicate = seen.has(row.hash) || rowIsDuplicate(row.hash);
    seen.add(row.hash);
    if (duplicate) duplicateRows += 1;

    return {
      index: row.index,
      type: row.input.type,
      assetSymbol: row.input.asset.symbol,
      assetName: row.input.asset.name,
      quantity: row.input.quantity,
      fiatAmount: row.input.fiatAmount,
      fiatCurrency: row.input.fiatCurrency,
      transactionDate: row.input.transactionDate,
      duplicate
    };
  });

  return {
    totalRows: parsed.length,
    importableRows: parsed.length - duplicateRows,
    duplicateRows,
    rows
  };
}

export function importTransactionsFromCsv(
  content: string,
  filename: string | null = null
): { imported: number; duplicates: number; batchId: string } {
  const parsed = parseTransactionsCsv(content);
  const seen = new Set<string>();
  const importable = parsed.filter((row) => {
    const duplicate = seen.has(row.hash) || rowIsDuplicate(row.hash);
    seen.add(row.hash);
    return !duplicate;
  });
  const duplicates = parsed.length - importable.length;
  const batchId = randomUUID();

  getSqlite().transaction(() => {
    db.insert(importBatches)
      .values({
        id: batchId,
        filename,
        totalRows: parsed.length,
        importedRows: importable.length,
        duplicateRows: duplicates,
        status: 'complete',
        createdAt: new Date().toISOString()
      })
      .run();

    for (const row of importable) {
      createTransaction({
        ...row.input,
        importBatchId: batchId,
        rowHash: row.hash
      });
    }
  })();

  return { imported: importable.length, duplicates, batchId };
}
