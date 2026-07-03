import Decimal from 'decimal.js';
import { desc, eq, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AssetRecord, Currency, TransactionRecord, TransactionType } from '$lib/types';
import { db } from './db/client';
import { assets, transactions, type AssetRow, type TransactionRow } from './db/schema';
import { UserInputError } from './errors';
import { type AssetInput, upsertAsset } from './assets';

export type TransactionInput = {
  asset: AssetInput;
  type: TransactionType;
  quantity: string;
  fiatAmount: string;
  fiatCurrency: Currency;
  feeAmount?: string | null;
  feeCurrency?: Currency | null;
  transactionDate: string;
  notes?: string | null;
};

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

function attachAssets(records: TransactionRecord[]): TransactionRecord[] {
  const assetById = new Map(
    db
      .select()
      .from(assets)
      .all()
      .map((asset) => [asset.id, mapAsset(asset)])
  );
  return records.map((transaction) => ({
    ...transaction,
    asset: assetById.get(transaction.assetId) ?? null
  }));
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
  return attachAssets(listTransactions());
}

export function getTransaction(id: string): TransactionRecord | null {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  return row ? mapTransaction(row) : null;
}

function getOpenQuantity(assetId: string, excludeTransactionId?: string): Decimal {
  const query = excludeTransactionId
    ? db.select().from(transactions).where(ne(transactions.id, excludeTransactionId)).all()
    : db.select().from(transactions).all();

  return query
    .filter((transaction) => transaction.assetId === assetId)
    .reduce((total, transaction) => {
      const quantity = new Decimal(transaction.quantity);
      return transaction.type === 'buy' ? total.plus(quantity) : total.minus(quantity);
    }, new Decimal(0));
}

function assertSellIsCovered(
  assetId: string,
  input: TransactionInput,
  excludeTransactionId?: string
) {
  if (input.type !== 'sell') return;
  const currentQuantity = getOpenQuantity(assetId, excludeTransactionId);
  const sellQuantity = new Decimal(input.quantity);
  if (sellQuantity.gt(currentQuantity)) {
    throw new UserInputError('Sell quantity exceeds the currently recorded holding.');
  }
}

export function createTransaction(input: TransactionInput): TransactionRecord {
  const asset = upsertAsset(input.asset);
  assertSellIsCovered(asset.id, input);
  const now = new Date().toISOString();

  const row = {
    id: randomUUID(),
    assetId: asset.id,
    assetSymbol: asset.symbol,
    assetName: asset.name,
    type: input.type,
    quantity: input.quantity,
    fiatAmount: input.fiatAmount,
    fiatCurrency: input.fiatCurrency,
    feeAmount: input.feeAmount || null,
    feeCurrency: input.feeAmount ? (input.feeCurrency ?? input.fiatCurrency) : null,
    transactionDate: input.transactionDate,
    notes: input.notes || null,
    createdAt: now,
    updatedAt: now
  };

  db.insert(transactions).values(row).run();
  return mapTransaction(row);
}

export function updateTransaction(id: string, input: TransactionInput): TransactionRecord {
  const existing = getTransaction(id);
  if (!existing) throw new UserInputError('Transaction not found.');

  const asset = upsertAsset(input.asset);
  assertSellIsCovered(asset.id, input, id);
  const now = new Date().toISOString();

  db.update(transactions)
    .set({
      assetId: asset.id,
      assetSymbol: asset.symbol,
      assetName: asset.name,
      type: input.type,
      quantity: input.quantity,
      fiatAmount: input.fiatAmount,
      fiatCurrency: input.fiatCurrency,
      feeAmount: input.feeAmount || null,
      feeCurrency: input.feeAmount ? (input.feeCurrency ?? input.fiatCurrency) : null,
      transactionDate: input.transactionDate,
      notes: input.notes || null,
      updatedAt: now
    })
    .where(eq(transactions.id, id))
    .run();

  const updated = getTransaction(id);
  if (!updated) throw new Error('Failed to update transaction.');
  return updated;
}

export function deleteTransaction(id: string): void {
  db.delete(transactions).where(eq(transactions.id, id)).run();
}
