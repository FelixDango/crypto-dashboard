import Decimal from 'decimal.js';
import type {
  NormalizedTransactionRecord,
  TransactionLedgerEntry,
  TransactionRecord
} from '$lib/types';
import { moneyText, quantityText, rateText } from './decimal';

export type AverageCostTransaction = TransactionRecord | NormalizedTransactionRecord;

export type AverageCostDisposal = {
  sellTransactionId: string;
  assetId: string;
  assetSymbol: string;
  assetName: string;
  quantitySold: string;
  proceedsAmount: string;
  costBasisAmount: string;
  realizedProfit: string;
  disposedAt: string;
};

export type AverageCostPosition = {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  imageUrl: string | null;
  firstBuyTransactionId: string;
  firstAcquiredAt: string;
  totalBoughtQuantity: string;
  currentQuantity: string;
  costBasis: string;
  averageCost: string;
  totalBuyCost: string;
  realizedProfit: string;
  totalFees: string;
  ledger: TransactionLedgerEntry[];
};

type MutablePosition = Omit<
  AverageCostPosition,
  | 'totalBoughtQuantity'
  | 'currentQuantity'
  | 'costBasis'
  | 'averageCost'
  | 'totalBuyCost'
  | 'realizedProfit'
  | 'totalFees'
> & {
  totalBoughtQuantityValue: Decimal;
  currentQuantityValue: Decimal;
  costBasisValue: Decimal;
  totalBuyCostValue: Decimal;
  realizedProfitValue: Decimal;
  totalFeesValue: Decimal;
};

export type AverageCostLedgerResult = {
  method: 'average_cost';
  version: 1;
  positions: AverageCostPosition[];
  disposals: AverageCostDisposal[];
};

function decimal(value: string | null | undefined): Decimal {
  return value ? new Decimal(value) : new Decimal(0);
}

function normalizedFiat(transaction: AverageCostTransaction): Decimal {
  return decimal(
    'normalizedFiatAmount' in transaction
      ? transaction.normalizedFiatAmount
      : transaction.fiatAmount
  );
}

function normalizedFee(transaction: AverageCostTransaction): Decimal {
  return decimal(
    'normalizedFeeAmount' in transaction ? transaction.normalizedFeeAmount : transaction.feeAmount
  );
}

function transactionFxRate(transaction: AverageCostTransaction): string {
  return 'fxRate' in transaction ? transaction.fxRate : '1';
}

function transactionFxSource(transaction: AverageCostTransaction): string {
  return 'fxSource' in transaction ? transaction.fxSource : 'same-currency';
}

export function chronologicalAverageCostTransactions<T extends AverageCostTransaction>(
  transactions: T[]
): T[] {
  return [...transactions].sort((a, b) => {
    const byDate = a.transactionDate.localeCompare(b.transactionDate);
    if (byDate !== 0) return byDate;
    const byCreated = a.createdAt.localeCompare(b.createdAt);
    if (byCreated !== 0) return byCreated;
    return 0;
  });
}

export function buildAverageCostLedger(
  transactions: AverageCostTransaction[]
): AverageCostLedgerResult {
  const positions = new Map<string, MutablePosition>();
  const disposals: AverageCostDisposal[] = [];

  for (const transaction of chronologicalAverageCostTransactions(transactions)) {
    const quantity = decimal(transaction.quantity);
    const fiatAmount = normalizedFiat(transaction);
    const feeAmount = normalizedFee(transaction);
    let position = positions.get(transaction.assetId);

    if (!position) {
      if (transaction.type === 'sell') {
        throw new Error(
          `Sell quantity exceeds available ${transaction.assetSymbol} on ${transaction.transactionDate.slice(0, 10)}.`
        );
      }
      position = {
        assetId: transaction.assetId,
        assetSymbol: transaction.assetSymbol,
        assetName: transaction.assetName,
        imageUrl: transaction.asset?.imageUrl ?? null,
        firstBuyTransactionId: transaction.id,
        firstAcquiredAt: transaction.transactionDate,
        totalBoughtQuantityValue: new Decimal(0),
        currentQuantityValue: new Decimal(0),
        costBasisValue: new Decimal(0),
        totalBuyCostValue: new Decimal(0),
        realizedProfitValue: new Decimal(0),
        totalFeesValue: new Decimal(0),
        ledger: []
      };
      positions.set(transaction.assetId, position);
    }

    let realizedProceeds = new Decimal(0);
    let realizedCostBasis = new Decimal(0);
    let realizedProfit = new Decimal(0);

    if (transaction.type === 'buy') {
      const buyCost = fiatAmount.plus(feeAmount);
      position.totalBoughtQuantityValue = position.totalBoughtQuantityValue.plus(quantity);
      position.currentQuantityValue = position.currentQuantityValue.plus(quantity);
      position.costBasisValue = position.costBasisValue.plus(buyCost);
      position.totalBuyCostValue = position.totalBuyCostValue.plus(buyCost);
    } else {
      if (quantity.gt(position.currentQuantityValue)) {
        throw new Error(
          `Sell quantity exceeds available ${transaction.assetSymbol} on ${transaction.transactionDate.slice(0, 10)}.`
        );
      }

      const averageCostBeforeSale = position.currentQuantityValue.gt(0)
        ? position.costBasisValue.div(position.currentQuantityValue)
        : new Decimal(0);
      realizedProceeds = fiatAmount.minus(feeAmount);
      realizedCostBasis = averageCostBeforeSale.mul(quantity);
      realizedProfit = realizedProceeds.minus(realizedCostBasis);
      position.currentQuantityValue = position.currentQuantityValue.minus(quantity);
      position.costBasisValue = position.costBasisValue.minus(realizedCostBasis);
      if (position.currentQuantityValue.eq(0)) position.costBasisValue = new Decimal(0);
      position.realizedProfitValue = position.realizedProfitValue.plus(realizedProfit);
      disposals.push({
        sellTransactionId: transaction.id,
        assetId: transaction.assetId,
        assetSymbol: transaction.assetSymbol,
        assetName: transaction.assetName,
        quantitySold: quantityText(quantity),
        proceedsAmount: moneyText(realizedProceeds),
        costBasisAmount: moneyText(realizedCostBasis),
        realizedProfit: moneyText(realizedProfit),
        disposedAt: transaction.transactionDate
      });
    }

    position.totalFeesValue = position.totalFeesValue.plus(feeAmount);
    const runningAverageCost = position.currentQuantityValue.gt(0)
      ? position.costBasisValue.div(position.currentQuantityValue)
      : new Decimal(0);
    position.ledger.push({
      transactionId: transaction.id,
      assetId: transaction.assetId,
      assetSymbol: transaction.assetSymbol,
      assetName: transaction.assetName,
      type: transaction.type,
      quantity: quantityText(quantity),
      transactionDate: transaction.transactionDate,
      fiatAmount: transaction.fiatAmount,
      fiatCurrency: transaction.fiatCurrency,
      normalizedFiatAmount: moneyText(fiatAmount),
      feeAmount: moneyText(feeAmount),
      normalizedFeeAmount: moneyText(feeAmount),
      fxRate: transactionFxRate(transaction),
      fxSource: transactionFxSource(transaction),
      runningQuantity: quantityText(position.currentQuantityValue),
      runningAverageCost: rateText(runningAverageCost),
      runningCostBasis: moneyText(position.costBasisValue),
      realizedProceeds: moneyText(realizedProceeds),
      realizedCostBasis: moneyText(realizedCostBasis),
      realizedProfit: moneyText(realizedProfit),
      totalFees: moneyText(position.totalFeesValue)
    });
  }

  return {
    method: 'average_cost',
    version: 1,
    positions: [...positions.values()].map((position) => ({
      assetId: position.assetId,
      assetSymbol: position.assetSymbol,
      assetName: position.assetName,
      imageUrl: position.imageUrl,
      firstBuyTransactionId: position.firstBuyTransactionId,
      firstAcquiredAt: position.firstAcquiredAt,
      totalBoughtQuantity: quantityText(position.totalBoughtQuantityValue),
      currentQuantity: quantityText(position.currentQuantityValue),
      costBasis: moneyText(position.costBasisValue),
      averageCost: rateText(
        position.currentQuantityValue.gt(0)
          ? position.costBasisValue.div(position.currentQuantityValue)
          : new Decimal(0)
      ),
      totalBuyCost: moneyText(position.totalBuyCostValue),
      realizedProfit: moneyText(position.realizedProfitValue),
      totalFees: moneyText(position.totalFeesValue),
      ledger: position.ledger
    })),
    disposals
  };
}
