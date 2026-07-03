import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import type { TransactionRecord } from '$lib/types';
import { transactionInputSchema } from '$lib/validation/transaction';
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

export function importTransactionsFromCsv(content: string): { imported: number } {
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

  let imported = 0;
  for (const row of rows) {
    const parsed = transactionInputSchema.parse({
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
    createTransaction(parsed);
    imported += 1;
  }

  return { imported };
}
