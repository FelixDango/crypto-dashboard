import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import type { Currency, TransactionRecord } from '$lib/types';
import { transactionInputSchema } from '$lib/validation/transaction';
import { db, getSqlite } from './db/client';
import { importBatches, portfolioSnapshots, transactions } from './db/schema';
import {
  listAverageCostDisposals,
  listAverageCostPositions,
  preparePortfolioAccounting,
  replacePortfolioAccounting
} from './portfolio/accounting';
import { listTransactionsWithAssets, prepareTransactionForPersistence } from './transactions';
import { serializePortfolioMutation } from './portfolio/mutation';

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

const openLotHeaders = [
  'accounting_method',
  'lot_id',
  'asset_id',
  'asset_symbol',
  'asset_name',
  'source_transaction_id',
  'original_quantity',
  'remaining_quantity',
  'cost_basis_total',
  'cost_basis_per_unit',
  'fiat_currency',
  'acquired_at',
  'created_at',
  'updated_at'
];

const realizedPnlHeaders = [
  'accounting_method',
  'disposal_id',
  'sell_transaction_id',
  'lot_id',
  'asset_id',
  'asset_symbol',
  'asset_name',
  'quantity_sold',
  'proceeds_amount',
  'cost_basis_amount',
  'realized_profit',
  'fiat_currency',
  'acquired_at',
  'disposed_at',
  'created_at'
];

const snapshotHeaders = [
  'snapshot_id',
  'snapshot_type',
  'base_currency',
  'bucket_at',
  'total_value',
  'total_invested',
  'unrealized_profit',
  'roi_percent',
  'price_status',
  'captured_at',
  'created_at',
  'holdings_json',
  'prices_json'
];

const MAX_CSV_BYTES = 5 * 1024 * 1024;

function exportCell(value: string | null | undefined): string {
  const cleaned = (value ?? '').replace(/\0/g, '').slice(0, 1000);
  return /^[\t\r ]*[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

function importCell(value: string | null | undefined): string {
  return (value ?? '').replace(/\0/g, '');
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
  if (Buffer.byteLength(content, 'utf8') > MAX_CSV_BYTES) {
    throw new Error('CSV import is limited to 5 MB.');
  }
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
        provider: importCell(row.asset_provider || 'coingecko'),
        providerCoinId: importCell(row.asset_provider_coin_id),
        symbol: importCell(row.asset_symbol),
        name: importCell(row.asset_name),
        imageUrl: ''
      },
      type: row.type,
      quantity: row.quantity,
      fiatAmount: row.fiat_amount,
      fiatCurrency: row.fiat_currency,
      feeAmount: row.fee_amount || null,
      feeCurrency: row.fee_currency || row.fiat_currency,
      transactionDate: row.transaction_date,
      notes: importCell(row.notes)
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
    asset_symbol: exportCell(transaction.assetSymbol),
    asset_name: exportCell(transaction.assetName),
    quantity: transaction.quantity,
    fiat_amount: transaction.fiatAmount,
    fiat_currency: transaction.fiatCurrency,
    fee_amount: transaction.feeAmount ?? '',
    fee_currency: transaction.feeCurrency ?? '',
    transaction_date: transaction.transactionDate,
    notes: exportCell(transaction.notes)
  }));

  return stringify(records, { header: true, columns: headers });
}

export function exportOpenLotsToCsv(): string {
  const records = listAverageCostPositions().map((lot) => ({
    accounting_method: 'average_cost',
    lot_id: lot.id,
    asset_id: lot.assetId,
    asset_symbol: exportCell(lot.assetSymbol),
    asset_name: exportCell(lot.assetName),
    source_transaction_id: lot.sourceTransactionId,
    original_quantity: lot.originalQuantity,
    remaining_quantity: lot.remainingQuantity,
    cost_basis_total: lot.costBasisTotal,
    cost_basis_per_unit: lot.costBasisPerUnit,
    fiat_currency: lot.fiatCurrency,
    acquired_at: lot.acquiredAt,
    created_at: lot.createdAt,
    updated_at: lot.updatedAt
  }));

  return stringify(records, { header: true, columns: openLotHeaders });
}

export function exportRealizedPnlToCsv(): string {
  const records = listAverageCostDisposals().map((disposal) => ({
    accounting_method: 'average_cost',
    disposal_id: disposal.id,
    sell_transaction_id: disposal.sellTransactionId,
    lot_id: disposal.lotId,
    asset_id: disposal.assetId,
    asset_symbol: exportCell(disposal.assetSymbol),
    asset_name: exportCell(disposal.assetName),
    quantity_sold: disposal.quantitySold,
    proceeds_amount: disposal.proceedsAmount,
    cost_basis_amount: disposal.costBasisAmount,
    realized_profit: disposal.realizedProfit,
    fiat_currency: disposal.fiatCurrency,
    acquired_at: disposal.acquiredAt,
    disposed_at: disposal.disposedAt,
    created_at: disposal.createdAt
  }));

  return stringify(records, { header: true, columns: realizedPnlHeaders });
}

export function exportPortfolioSnapshotsToCsv(): string {
  const records = db
    .select()
    .from(portfolioSnapshots)
    .all()
    .map((snapshot) => ({
      snapshot_id: snapshot.id,
      snapshot_type: snapshot.snapshotType,
      base_currency: snapshot.baseCurrency,
      bucket_at: snapshot.bucketAt,
      total_value: snapshot.totalValue,
      total_invested: snapshot.totalInvested,
      unrealized_profit: snapshot.unrealizedProfit,
      roi_percent: snapshot.roiPercent,
      price_status: snapshot.priceStatus,
      captured_at: snapshot.capturedAt,
      created_at: snapshot.createdAt,
      holdings_json: snapshot.holdingsJson,
      prices_json: snapshot.pricesJson
    }));

  return stringify(records, { header: true, columns: snapshotHeaders });
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

export async function importTransactionsFromCsv(
  content: string,
  filename: string | null = null
): Promise<{ imported: number; duplicates: number; batchId: string }> {
  return serializePortfolioMutation(async () => {
    const parsed = parseTransactionsCsv(content);
    const seen = new Set<string>();
    const importable = parsed.filter((row) => {
      const duplicate = seen.has(row.hash) || rowIsDuplicate(row.hash);
      seen.add(row.hash);
      return !duplicate;
    });
    const duplicates = parsed.length - importable.length;
    const batchId = randomUUID();
    const prepared = importable.map((row) =>
      prepareTransactionForPersistence(
        {
          ...row.input,
          importBatchId: batchId,
          rowHash: row.hash
        },
        false
      )
    );
    const plan = await preparePortfolioAccounting([
      ...listTransactionsWithAssets(),
      ...prepared.map((item) => item.record)
    ]);

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
      if (prepared.length > 0) {
        db.insert(transactions)
          .values(prepared.map((item) => item.row))
          .run();
      }
      replacePortfolioAccounting(plan);
    })();

    return { imported: importable.length, duplicates, batchId };
  });
}
