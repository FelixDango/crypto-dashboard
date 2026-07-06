import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import type {
  AssetRecord,
  Currency,
  NormalizedTransactionRecord,
  TransactionRecord,
  TransactionType
} from '$lib/types';
import { normalizeTransactions } from '$lib/server/fx/cache';
import { getAppSettings } from '$lib/server/settings';
import { db, getSqlite } from '$lib/server/db/client';
import {
  assetLots,
  assets,
  lotDisposals,
  transactions,
  type AssetLotRow,
  type AssetRow,
  type LotDisposalRow,
  type NewAssetLotRow,
  type NewLotDisposalRow,
  type TransactionRow
} from '$lib/server/db/schema';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type AccountingBalanceTransaction = {
  id: string;
  assetId: string;
  assetSymbol: string;
  type: TransactionType;
  quantity: string;
  transactionDate: string;
  createdAt: string;
};

type MutableLot = {
  row: NewAssetLotRow;
  remainingQuantity: Decimal;
  costBasisTotal: Decimal;
  costBasisPerUnit: Decimal;
};

type AccountingPlan = {
  lots: NewAssetLotRow[];
  disposals: NewLotDisposalRow[];
};

export type OpenLotView = AssetLotRow & {
  assetSymbol: string;
  assetName: string;
};

export type LotDisposalView = LotDisposalRow & {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  fiatCurrency: Currency;
  acquiredAt: string;
};

export class AccountingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingValidationError';
  }
}

function asDecimal(value: string | null | undefined): Decimal {
  if (!value) return new Decimal(0);
  return new Decimal(value);
}

function toText(value: Decimal): string {
  if (!value.isFinite()) return '0';
  const cleaned = value.abs().lt('0.000000000001') ? new Decimal(0) : value;
  return cleaned.toDecimalPlaces(12).toString();
}

function compareChronological(
  a: { transactionDate: string; createdAt: string; id: string },
  b: { transactionDate: string; createdAt: string; id: string }
): number {
  const byDate = a.transactionDate.localeCompare(b.transactionDate);
  if (byDate !== 0) return byDate;
  const byCreated = a.createdAt.localeCompare(b.createdAt);
  if (byCreated !== 0) return byCreated;
  return a.id.localeCompare(b.id);
}

function chronological<T extends { transactionDate: string; createdAt: string; id: string }>(
  rows: T[]
): T[] {
  return [...rows].sort(compareChronological);
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

function mapTransaction(row: TransactionRow, asset: AssetRecord | null): TransactionRecord {
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
    updatedAt: row.updatedAt,
    asset
  };
}

function listTransactionsChronologicalWithAssets(): TransactionRecord[] {
  const assetById = new Map(
    db
      .select()
      .from(assets)
      .all()
      .map((asset) => [asset.id, mapAsset(asset)])
  );
  return chronological(
    db
      .select()
      .from(transactions)
      .all()
      .map((transaction) => mapTransaction(transaction, assetById.get(transaction.assetId) ?? null))
  );
}

function availableMessage(
  transaction: AccountingBalanceTransaction,
  available: Decimal,
  attempted: Decimal
): string {
  return `Sell quantity exceeds available ${transaction.assetSymbol} on ${transaction.transactionDate.slice(
    0,
    10
  )}. Available: ${toText(available)}, attempted: ${toText(attempted)}.`;
}

export function assertNoNegativeHoldings(rows: AccountingBalanceTransaction[]): void {
  const balances = new Map<string, Decimal>();

  for (const transaction of chronological(rows)) {
    const quantity = asDecimal(transaction.quantity);
    const current = balances.get(transaction.assetId) ?? new Decimal(0);

    if (transaction.type === 'buy') {
      balances.set(transaction.assetId, current.plus(quantity));
      continue;
    }

    if (quantity.gt(current)) {
      throw new AccountingValidationError(availableMessage(transaction, current, quantity));
    }

    balances.set(transaction.assetId, current.minus(quantity));
  }
}

function buildAccountingPlan(
  transactionsToProcess: NormalizedTransactionRecord[],
  fiatCurrency: Currency,
  now: string
): AccountingPlan {
  assertNoNegativeHoldings(transactionsToProcess);

  const lots: MutableLot[] = [];
  const disposals: NewLotDisposalRow[] = [];
  const openLotsByAsset = new Map<string, MutableLot[]>();

  for (const transaction of chronological(transactionsToProcess)) {
    const quantity = asDecimal(transaction.quantity);

    if (transaction.type === 'buy') {
      const costBasisTotal = asDecimal(transaction.normalizedFiatAmount).plus(
        transaction.normalizedFeeAmount
      );
      const costBasisPerUnit = costBasisTotal.div(quantity);
      const lot: MutableLot = {
        row: {
          id: randomUUID(),
          assetId: transaction.assetId,
          sourceTransactionId: transaction.id,
          originalQuantity: toText(quantity),
          remainingQuantity: toText(quantity),
          costBasisTotal: toText(costBasisTotal),
          costBasisPerUnit: toText(costBasisPerUnit),
          fiatCurrency,
          acquiredAt: transaction.transactionDate,
          createdAt: now,
          updatedAt: now
        },
        remainingQuantity: quantity,
        costBasisTotal,
        costBasisPerUnit
      };

      lots.push(lot);
      const openLots = openLotsByAsset.get(transaction.assetId) ?? [];
      openLots.push(lot);
      openLotsByAsset.set(transaction.assetId, openLots);
      continue;
    }

    let quantityToSell = quantity;
    const totalProceeds = asDecimal(transaction.normalizedFiatAmount).minus(
      transaction.normalizedFeeAmount
    );
    const openLots = openLotsByAsset.get(transaction.assetId) ?? [];

    for (const lot of openLots) {
      if (quantityToSell.lte(0)) break;
      if (lot.remainingQuantity.lte(0)) continue;

      const quantitySold = Decimal.min(quantityToSell, lot.remainingQuantity);
      const costBasisAmount = lot.costBasisPerUnit.mul(quantitySold);
      const proceedsAmount = totalProceeds.mul(quantitySold).div(quantity);
      const realizedProfit = proceedsAmount.minus(costBasisAmount);

      disposals.push({
        id: randomUUID(),
        sellTransactionId: transaction.id,
        lotId: lot.row.id,
        quantitySold: toText(quantitySold),
        proceedsAmount: toText(proceedsAmount),
        costBasisAmount: toText(costBasisAmount),
        realizedProfit: toText(realizedProfit),
        disposedAt: transaction.transactionDate,
        createdAt: now
      });

      lot.remainingQuantity = lot.remainingQuantity.minus(quantitySold);
      lot.costBasisTotal = lot.remainingQuantity.gt(0)
        ? lot.costBasisPerUnit.mul(lot.remainingQuantity)
        : new Decimal(0);
      lot.row.remainingQuantity = toText(lot.remainingQuantity);
      lot.row.costBasisTotal = toText(lot.costBasisTotal);
      lot.row.updatedAt = now;
      quantityToSell = quantityToSell.minus(quantitySold);
    }

    if (quantityToSell.gt(0)) {
      throw new AccountingValidationError(
        availableMessage(transaction, quantity.minus(quantityToSell), quantity)
      );
    }
  }

  return {
    lots: lots.map((lot) => lot.row),
    disposals
  };
}

function clearAccountingTables(): void {
  db.delete(lotDisposals).run();
  db.delete(assetLots).run();
}

export async function rebuildPortfolioAccounting(): Promise<{ lots: number; disposals: number }> {
  const settings = getAppSettings();
  const allTransactions = listTransactionsChronologicalWithAssets();
  const normalized = await normalizeTransactions(allTransactions, settings.baseCurrency);
  const plan = buildAccountingPlan(normalized, settings.baseCurrency, new Date().toISOString());

  getSqlite().transaction(() => {
    clearAccountingTables();
    if (plan.lots.length > 0) db.insert(assetLots).values(plan.lots).run();
    if (plan.disposals.length > 0) db.insert(lotDisposals).values(plan.disposals).run();
  })();

  return {
    lots: plan.lots.length,
    disposals: plan.disposals.length
  };
}

export async function ensurePortfolioAccounting(): Promise<void> {
  const transactionCount = db.select().from(transactions).all().length;
  const lotCount = db.select().from(assetLots).all().length;
  const disposalCount = db.select().from(lotDisposals).all().length;

  if (transactionCount === 0) {
    if (lotCount > 0 || disposalCount > 0) {
      getSqlite().transaction(clearAccountingTables)();
    }
    return;
  }

  if (lotCount === 0) {
    await rebuildPortfolioAccounting();
  }
}

function assetLookup(): Map<string, AssetRecord> {
  return new Map(
    db
      .select()
      .from(assets)
      .all()
      .map((asset) => [asset.id, mapAsset(asset)])
  );
}

export function listOpenLots(assetId?: string): OpenLotView[] {
  const assetsById = assetLookup();

  return db
    .select()
    .from(assetLots)
    .all()
    .filter(
      (lot) => (!assetId || lot.assetId === assetId) && asDecimal(lot.remainingQuantity).gt(0)
    )
    .sort((a, b) => {
      const byAcquired = a.acquiredAt.localeCompare(b.acquiredAt);
      if (byAcquired !== 0) return byAcquired;
      return a.createdAt.localeCompare(b.createdAt);
    })
    .map((lot) => {
      const asset = assetsById.get(lot.assetId);
      return {
        ...lot,
        assetSymbol: asset?.symbol ?? lot.assetId,
        assetName: asset?.name ?? lot.assetId
      };
    });
}

export function listLotDisposals(assetId?: string): LotDisposalView[] {
  const assetsById = assetLookup();
  const lotsById = new Map(
    db
      .select()
      .from(assetLots)
      .all()
      .map((lot) => [lot.id, lot])
  );

  return db
    .select()
    .from(lotDisposals)
    .all()
    .filter((disposal) => {
      const lot = lotsById.get(disposal.lotId);
      return Boolean(lot && (!assetId || lot.assetId === assetId));
    })
    .sort((a, b) => {
      const byDisposed = b.disposedAt.localeCompare(a.disposedAt);
      if (byDisposed !== 0) return byDisposed;
      return b.createdAt.localeCompare(a.createdAt);
    })
    .map((disposal) => {
      const lot = lotsById.get(disposal.lotId);
      const asset = lot ? assetsById.get(lot.assetId) : null;
      return {
        ...disposal,
        assetId: lot?.assetId ?? '',
        assetSymbol: asset?.symbol ?? lot?.assetId ?? '',
        assetName: asset?.name ?? lot?.assetId ?? '',
        fiatCurrency: lot?.fiatCurrency ?? 'EUR',
        acquiredAt: lot?.acquiredAt ?? disposal.disposedAt
      };
    });
}
