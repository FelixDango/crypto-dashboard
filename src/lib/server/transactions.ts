import { desc, eq, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AssetRecord, Currency, TransactionRecord, TransactionType } from '$lib/types';
import { db, getSqlite } from './db/client';
import { assets, transactions, type AssetRow, type TransactionRow } from './db/schema';
import { UserInputError } from './errors';
import { createAssetId, type AssetInput, upsertAsset } from './assets';
import {
  assertNoNegativeHoldings,
  preparePortfolioAccounting,
  replacePortfolioAccounting,
  type AccountingBalanceTransaction
} from './portfolio/accounting';
import { serializePortfolioMutation } from './portfolio/mutation';

export type TransactionInput = {
  asset: AssetInput;
  type: TransactionType;
  quantity: string;
  fiatAmount: string;
  fiatCurrency: Currency;
  feeAmount?: string | null;
  feeCurrency?: Currency | null;
  importBatchId?: string | null;
  rowHash?: string | null;
  transactionDate: string;
  notes?: string | null;
};

let lastCreatedAtMs = 0;

function nextCreatedAt(): string {
  const now = Date.now();
  const next = now <= lastCreatedAtMs ? lastCreatedAtMs + 1 : now;
  lastCreatedAtMs = next;
  return new Date(next).toISOString();
}

function mapTransaction(row: TransactionRow): TransactionRecord {
  return {
    id: row.id,
    assetId: row.assetId,
    assetSymbol: row.assetSymbol,
    assetName: row.assetName,
    type: row.type,
    quantity: row.quantity,
    fiatAmount: row.fiatAmount,
    fiatCurrency: row.fiatCurrency,
    feeAmount: row.feeAmount,
    feeCurrency: row.feeCurrency,
    importBatchId: row.importBatchId,
    rowHash: row.rowHash,
    transactionDate: row.transactionDate,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapAsset(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    provider: row.provider,
    providerCoinId: row.providerCoinId,
    symbol: row.symbol,
    name: row.name,
    imageUrl: row.imageUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function listTransactions(): TransactionRecord[] {
  return db
    .select()
    .from(transactions)
    .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
    .all()
    .map(mapTransaction);
}

export function listTransactionsWithAssets(): TransactionRecord[] {
  return db
    .select({ transaction: transactions, asset: assets })
    .from(transactions)
    .leftJoin(assets, eq(transactions.assetId, assets.id))
    .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
    .all()
    .map((row) => ({
      ...mapTransaction(row.transaction),
      asset: row.asset ? mapAsset(row.asset) : null
    }));
}

export function getTransaction(id: string): TransactionRecord | null {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  return row ? mapTransaction(row) : null;
}

function toBalanceTransaction(row: TransactionRow): AccountingBalanceTransaction {
  return {
    id: row.id,
    assetId: row.assetId,
    assetSymbol: row.assetSymbol,
    type: row.type,
    quantity: row.quantity,
    transactionDate: row.transactionDate,
    createdAt: row.createdAt
  };
}

function assertMutationDoesNotOversell(
  proposed?: AccountingBalanceTransaction,
  excludeTransactionId?: string
): void {
  const query = excludeTransactionId
    ? db.select().from(transactions).where(ne(transactions.id, excludeTransactionId)).all()
    : db.select().from(transactions).all();
  const rows = query.map(toBalanceTransaction);

  if (proposed) rows.push(proposed);
  assertNoNegativeHoldings(rows);
}

export type PreparedTransaction = {
  row: TransactionRow;
  record: TransactionRecord;
};

export function prepareTransactionForPersistence(
  input: TransactionInput,
  validateBalance = true
): PreparedTransaction {
  const now = nextCreatedAt();
  const assetId = createAssetId(input.asset.provider ?? 'coingecko', input.asset.providerCoinId);
  const id = randomUUID();

  if (validateBalance) {
    assertMutationDoesNotOversell({
      id,
      assetId,
      assetSymbol: input.asset.symbol,
      type: input.type,
      quantity: input.quantity,
      transactionDate: input.transactionDate,
      createdAt: now
    });
  }

  const asset = upsertAsset(input.asset);

  const row: TransactionRow = {
    id,
    assetId: asset.id,
    assetSymbol: asset.symbol,
    assetName: asset.name,
    type: input.type,
    quantity: input.quantity,
    fiatAmount: input.fiatAmount,
    fiatCurrency: input.fiatCurrency,
    feeAmount: input.feeAmount || null,
    feeCurrency: input.feeAmount ? (input.feeCurrency ?? input.fiatCurrency) : null,
    importBatchId: input.importBatchId ?? null,
    rowHash: input.rowHash ?? null,
    transactionDate: input.transactionDate,
    notes: input.notes || null,
    createdAt: now,
    updatedAt: now
  };

  return { row, record: { ...mapTransaction(row), asset } };
}

export function createTransactionWithoutAccounting(input: TransactionInput): TransactionRecord {
  const { row, record } = prepareTransactionForPersistence(input);
  db.insert(transactions).values(row).run();
  return record;
}

export async function createTransaction(input: TransactionInput): Promise<TransactionRecord> {
  return serializePortfolioMutation(async () => {
    const { row, record } = prepareTransactionForPersistence(input);
    const plan = await preparePortfolioAccounting([...listTransactionsWithAssets(), record]);

    getSqlite().transaction(() => {
      db.insert(transactions).values(row).run();
      replacePortfolioAccounting(plan);
    })();
    return record;
  });
}

export async function updateTransaction(
  id: string,
  input: TransactionInput
): Promise<TransactionRecord> {
  return serializePortfolioMutation(async () => {
    const existing = getTransaction(id);
    if (!existing) throw new UserInputError('Transaction not found.');

    const assetId = createAssetId(input.asset.provider ?? 'coingecko', input.asset.providerCoinId);
    assertMutationDoesNotOversell(
      {
        id,
        assetId,
        assetSymbol: input.asset.symbol,
        type: input.type,
        quantity: input.quantity,
        transactionDate: input.transactionDate,
        createdAt: existing.createdAt
      },
      id
    );

    const asset = upsertAsset(input.asset);
    const updatedRow: TransactionRow = {
      ...existing,
      assetId: asset.id,
      assetSymbol: asset.symbol,
      assetName: asset.name,
      type: input.type,
      quantity: input.quantity,
      fiatAmount: input.fiatAmount,
      fiatCurrency: input.fiatCurrency,
      feeAmount: input.feeAmount || null,
      feeCurrency: input.feeAmount ? (input.feeCurrency ?? input.fiatCurrency) : null,
      importBatchId: input.importBatchId ?? existing.importBatchId,
      rowHash: input.rowHash ?? null,
      transactionDate: input.transactionDate,
      notes: input.notes || null,
      updatedAt: new Date().toISOString()
    };
    const updated = { ...mapTransaction(updatedRow), asset };
    const prospective = listTransactionsWithAssets().map((transaction) =>
      transaction.id === id ? updated : transaction
    );
    const plan = await preparePortfolioAccounting(prospective);

    getSqlite().transaction(() => {
      db.update(transactions)
        .set({
          assetId: updatedRow.assetId,
          assetSymbol: updatedRow.assetSymbol,
          assetName: updatedRow.assetName,
          type: updatedRow.type,
          quantity: updatedRow.quantity,
          fiatAmount: updatedRow.fiatAmount,
          fiatCurrency: updatedRow.fiatCurrency,
          feeAmount: updatedRow.feeAmount,
          feeCurrency: updatedRow.feeCurrency,
          importBatchId: updatedRow.importBatchId,
          rowHash: updatedRow.rowHash,
          transactionDate: updatedRow.transactionDate,
          notes: updatedRow.notes,
          updatedAt: updatedRow.updatedAt
        })
        .where(eq(transactions.id, id))
        .run();
      replacePortfolioAccounting(plan);
    })();
    return updated;
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  return serializePortfolioMutation(async () => {
    const existing = getTransaction(id);
    if (!existing) throw new UserInputError('Transaction not found.');
    assertMutationDoesNotOversell(undefined, id);
    const prospective = listTransactionsWithAssets().filter((transaction) => transaction.id !== id);
    const plan = await preparePortfolioAccounting(prospective);

    getSqlite().transaction(() => {
      db.delete(transactions).where(eq(transactions.id, id)).run();
      replacePortfolioAccounting(plan);
    })();
  });
}
