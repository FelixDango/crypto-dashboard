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
import { buildAverageCostLedger } from '$lib/portfolio/averageCost';
import { quantityText } from '$lib/portfolio/decimal';
import { getAppSettings } from '$lib/server/settings';
import { db, getSqlite } from '$lib/server/db/client';
import { serializePortfolioMutation } from '$lib/server/portfolio/mutation';
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

Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

export type AccountingBalanceTransaction = {
  id: string;
  assetId: string;
  assetSymbol: string;
  type: TransactionType;
  quantity: string;
  transactionDate: string;
  createdAt: string;
};

export type AccountingPlan = {
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

export class AccountingDataIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingDataIncompleteError';
  }
}

function asDecimal(value: string | null | undefined): Decimal {
  if (!value) return new Decimal(0);
  return new Decimal(value);
}

function toText(value: Decimal): string {
  return quantityText(value);
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
  const ledger = buildAverageCostLedger(transactionsToProcess);
  const positionIdByAsset = new Map(
    ledger.positions.map((position) => [position.assetId, randomUUID()])
  );
  const lots: NewAssetLotRow[] = ledger.positions.map((position) => ({
    id: positionIdByAsset.get(position.assetId)!,
    assetId: position.assetId,
    sourceTransactionId: position.firstBuyTransactionId,
    originalQuantity: position.totalBoughtQuantity,
    remainingQuantity: position.currentQuantity,
    costBasisTotal: position.costBasis,
    costBasisPerUnit: position.averageCost,
    fiatCurrency,
    acquiredAt: position.firstAcquiredAt,
    createdAt: now,
    updatedAt: now
  }));
  const disposals: NewLotDisposalRow[] = ledger.disposals.map((disposal) => ({
    id: randomUUID(),
    sellTransactionId: disposal.sellTransactionId,
    lotId: positionIdByAsset.get(disposal.assetId)!,
    quantitySold: disposal.quantitySold,
    proceedsAmount: disposal.proceedsAmount,
    costBasisAmount: disposal.costBasisAmount,
    realizedProfit: disposal.realizedProfit,
    disposedAt: disposal.disposedAt,
    createdAt: now
  }));

  return {
    lots,
    disposals
  };
}

function clearAccountingTables(): void {
  db.delete(lotDisposals).run();
  db.delete(assetLots).run();
}

export async function preparePortfolioAccounting(
  records: TransactionRecord[],
  baseCurrency: Currency = getAppSettings().baseCurrency
): Promise<AccountingPlan> {
  const normalized = await normalizeTransactions(records, baseCurrency);
  const incomplete = normalized.filter((transaction) => !transaction.fxComplete);
  if (incomplete.length > 0) {
    throw new AccountingDataIncompleteError(
      `Accounting rebuild deferred because ${incomplete.length} transaction${incomplete.length === 1 ? '' : 's'} have incomplete FX data.`
    );
  }
  return buildAccountingPlan(normalized, baseCurrency, new Date().toISOString());
}

export function replacePortfolioAccounting(plan: AccountingPlan): void {
  clearAccountingTables();
  if (plan.lots.length > 0) db.insert(assetLots).values(plan.lots).run();
  if (plan.disposals.length > 0) db.insert(lotDisposals).values(plan.disposals).run();
}

export async function rebuildPortfolioAccounting(): Promise<{
  method: 'average_cost';
  version: 1;
  positions: number;
  disposals: number;
  lots: number;
}> {
  return serializePortfolioMutation(async () => {
    const settings = getAppSettings();
    const allTransactions = listTransactionsChronologicalWithAssets();
    const plan = await preparePortfolioAccounting(allTransactions, settings.baseCurrency);

    getSqlite().transaction(() => {
      replacePortfolioAccounting(plan);
    })();

    return {
      method: 'average_cost',
      version: 1,
      positions: plan.lots.length,
      lots: plan.lots.length,
      disposals: plan.disposals.length
    };
  });
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
    try {
      await rebuildPortfolioAccounting();
    } catch (error) {
      if (!(error instanceof AccountingDataIncompleteError)) throw error;
    }
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

export function listAverageCostPositions(assetId?: string): OpenLotView[] {
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

export function listOpenLots(assetId?: string): OpenLotView[] {
  return listAverageCostPositions(assetId);
}

export function listAverageCostDisposals(assetId?: string): LotDisposalView[] {
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

export function listLotDisposals(assetId?: string): LotDisposalView[] {
  return listAverageCostDisposals(assetId);
}
