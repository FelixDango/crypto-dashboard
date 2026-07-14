import Decimal from 'decimal.js';
import type {
  Currency,
  HoldingSummary,
  NormalizedTransactionRecord,
  PortfolioOverview,
  PortfolioTotals,
  PriceQuote,
  TransactionLedgerEntry,
  TransactionRecord
} from '$lib/types';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

type MutableHolding = {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  imageUrl: string | null;
  currentQuantity: Decimal;
  costBasis: Decimal;
  totalBuyCost: Decimal;
  realizedProfit: Decimal;
  totalFees: Decimal;
  lots: OpenCalculationLot[];
  ledger: TransactionLedgerEntry[];
};

type CalculationTransaction = TransactionRecord | NormalizedTransactionRecord;

type OpenCalculationLot = {
  remainingQuantity: Decimal;
  costBasisPerUnit: Decimal;
  costBasisTotal: Decimal;
};

function zeroTotals(baseCurrency: Currency): PortfolioTotals {
  return {
    baseCurrency,
    currentValue: '0',
    investedAmount: '0',
    totalBuyCost: '0',
    unrealizedProfit: '0',
    totalProfit: '0',
    roiPercent: '0',
    realizedProfit: '0',
    realizedProfitApprox: '0',
    totalFees: '0',
    stalePriceCount: 0,
    missingPriceCount: 0,
    fxWarningCount: 0
  };
}

function asDecimal(value: string | null | undefined): Decimal {
  if (!value) return new Decimal(0);
  return new Decimal(value);
}

function toText(value: Decimal): string {
  if (!value.isFinite()) return '0';
  return value.toDecimalPlaces(12).toString();
}

function normalizedFiat(transaction: CalculationTransaction): Decimal {
  return asDecimal(
    'normalizedFiatAmount' in transaction
      ? transaction.normalizedFiatAmount
      : transaction.fiatAmount
  );
}

function normalizedFee(transaction: CalculationTransaction): Decimal {
  return asDecimal(
    'normalizedFeeAmount' in transaction ? transaction.normalizedFeeAmount : transaction.feeAmount
  );
}

function fxRate(transaction: CalculationTransaction): string {
  return 'fxRate' in transaction ? transaction.fxRate : '1';
}

function fxSource(transaction: CalculationTransaction): string {
  return 'fxSource' in transaction ? transaction.fxSource : 'same-currency';
}

function chronological(transactions: CalculationTransaction[]): CalculationTransaction[] {
  return [...transactions].sort((a, b) => {
    const byDate = new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime();
    if (byDate !== 0) return byDate;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function calculateHoldings(
  transactions: CalculationTransaction[],
  quotes: PriceQuote[]
): HoldingSummary[] {
  const quoteByAsset = new Map(quotes.map((quote) => [quote.assetId, quote]));
  const grouped = new Map<string, MutableHolding>();

  for (const transaction of chronological(transactions)) {
    const existing =
      grouped.get(transaction.assetId) ??
      ({
        assetId: transaction.assetId,
        assetSymbol: transaction.assetSymbol,
        assetName: transaction.assetName,
        imageUrl: transaction.asset?.imageUrl ?? null,
        currentQuantity: new Decimal(0),
        costBasis: new Decimal(0),
        totalBuyCost: new Decimal(0),
        realizedProfit: new Decimal(0),
        totalFees: new Decimal(0),
        lots: [],
        ledger: []
      } satisfies MutableHolding);

    const quantity = asDecimal(transaction.quantity);
    const fiatAmount = normalizedFiat(transaction);
    const feeAmount = normalizedFee(transaction);
    let realizedProceeds = new Decimal(0);
    let realizedCostBasis = new Decimal(0);
    let realizedProfit = new Decimal(0);

    if (transaction.type === 'buy') {
      const buyCost = fiatAmount.plus(feeAmount);
      const costBasisPerUnit = buyCost.div(quantity);
      existing.totalBuyCost = existing.totalBuyCost.plus(buyCost);
      existing.costBasis = existing.costBasis.plus(buyCost);
      existing.currentQuantity = existing.currentQuantity.plus(quantity);
      existing.lots.push({
        remainingQuantity: quantity,
        costBasisPerUnit,
        costBasisTotal: buyCost
      });
    } else {
      let quantityToSell = quantity;
      const totalProceeds = fiatAmount.minus(feeAmount);

      if (quantity.gt(existing.currentQuantity)) {
        throw new Error(
          `Sell quantity exceeds available ${transaction.assetSymbol} on ${transaction.transactionDate.slice(
            0,
            10
          )}.`
        );
      }

      for (const lot of existing.lots) {
        if (quantityToSell.lte(0)) break;
        if (lot.remainingQuantity.lte(0)) continue;

        const quantitySold = Decimal.min(quantityToSell, lot.remainingQuantity);
        const proceedsAmount = totalProceeds.mul(quantitySold).div(quantity);
        const costBasisAmount = lot.costBasisPerUnit.mul(quantitySold);

        realizedProceeds = realizedProceeds.plus(proceedsAmount);
        realizedCostBasis = realizedCostBasis.plus(costBasisAmount);

        lot.remainingQuantity = lot.remainingQuantity.minus(quantitySold);
        lot.costBasisTotal = lot.remainingQuantity.gt(0)
          ? lot.costBasisPerUnit.mul(lot.remainingQuantity)
          : new Decimal(0);
        quantityToSell = quantityToSell.minus(quantitySold);
      }

      realizedProfit = realizedProceeds.minus(realizedCostBasis);
      existing.realizedProfit = existing.realizedProfit.plus(realizedProfit);
      existing.costBasis = existing.lots.reduce(
        (total, lot) => total.plus(lot.costBasisTotal),
        new Decimal(0)
      );
      existing.currentQuantity = existing.lots.reduce(
        (total, lot) => total.plus(lot.remainingQuantity),
        new Decimal(0)
      );
      if (existing.currentQuantity.eq(0)) {
        existing.costBasis = new Decimal(0);
      }
    }

    existing.totalFees = existing.totalFees.plus(feeAmount);
    const runningAverageCost = existing.currentQuantity.gt(0)
      ? existing.costBasis.div(existing.currentQuantity)
      : new Decimal(0);
    existing.ledger.push({
      transactionId: transaction.id,
      assetId: transaction.assetId,
      assetSymbol: transaction.assetSymbol,
      assetName: transaction.assetName,
      type: transaction.type,
      quantity: transaction.quantity,
      transactionDate: transaction.transactionDate,
      fiatAmount: transaction.fiatAmount,
      fiatCurrency: transaction.fiatCurrency,
      normalizedFiatAmount: toText(fiatAmount),
      feeAmount: toText(feeAmount),
      normalizedFeeAmount: toText(feeAmount),
      fxRate: fxRate(transaction),
      fxSource: fxSource(transaction),
      runningQuantity: toText(existing.currentQuantity),
      runningAverageCost: toText(runningAverageCost),
      runningCostBasis: toText(existing.costBasis),
      realizedProceeds: toText(realizedProceeds),
      realizedCostBasis: toText(realizedCostBasis),
      realizedProfit: toText(realizedProfit),
      totalFees: toText(existing.totalFees)
    });

    grouped.set(transaction.assetId, existing);
  }

  const preliminary = [...grouped.values()].map((holding) => {
    const averageCost = holding.currentQuantity.gt(0)
      ? holding.costBasis.div(holding.currentQuantity)
      : new Decimal(0);
    const quote = quoteByAsset.get(holding.assetId);
    const hasPrice = Boolean(quote && quote.capturedAt !== null);
    const currentPrice = hasPrice ? asDecimal(quote?.price) : new Decimal(0);
    const currentValue = hasPrice ? holding.currentQuantity.mul(currentPrice) : new Decimal(0);
    const unrealizedProfit = hasPrice ? currentValue.minus(holding.costBasis) : new Decimal(0);
    const totalProfit = unrealizedProfit.plus(holding.realizedProfit);
    const roiPercent = holding.totalBuyCost.gt(0)
      ? totalProfit.div(holding.totalBuyCost).mul(100)
      : new Decimal(0);
    const priceStatus: HoldingSummary['priceStatus'] = !hasPrice
      ? 'missing'
      : quote?.stale
        ? 'stale'
        : 'fresh';

    return {
      assetId: holding.assetId,
      assetSymbol: holding.assetSymbol,
      assetName: holding.assetName,
      imageUrl: holding.imageUrl,
      quantity: toText(holding.currentQuantity),
      averageCost: toText(averageCost),
      currentPrice: toText(currentPrice),
      currentValue: toText(currentValue),
      totalBuyCost: toText(holding.totalBuyCost),
      costBasis: toText(holding.costBasis),
      unrealizedProfit: toText(unrealizedProfit),
      totalProfit: toText(totalProfit),
      roiPercent: toText(roiPercent),
      realizedProfit: toText(holding.realizedProfit),
      realizedProfitApprox: toText(holding.realizedProfit),
      totalFees: toText(holding.totalFees),
      allocationPercent: '0',
      stalePrice: priceStatus === 'stale',
      priceSource: quote?.source ?? null,
      priceCapturedAt: quote?.capturedAt ?? null,
      priceStatus,
      ledger: holding.ledger
    } satisfies HoldingSummary;
  });

  const totalValue = preliminary.reduce(
    (total, holding) => total.plus(holding.currentValue),
    new Decimal(0)
  );

  return preliminary
    .map((holding) => ({
      ...holding,
      allocationPercent: totalValue.gt(0)
        ? toText(new Decimal(holding.currentValue).div(totalValue).mul(100))
        : '0'
    }))
    .sort((a, b) => new Decimal(b.currentValue).cmp(a.currentValue));
}

export function calculatePortfolio(
  transactions: CalculationTransaction[],
  quotes: PriceQuote[],
  baseCurrency: Currency
): Pick<
  PortfolioOverview,
  'totals' | 'holdings' | 'allocation' | 'bestPerformer' | 'worstPerformer'
> {
  const holdings = calculateHoldings(transactions, quotes);
  const totals = holdings.reduce((accumulator, holding) => {
    accumulator.currentValue = toText(
      new Decimal(accumulator.currentValue).plus(holding.currentValue)
    );
    accumulator.investedAmount = toText(
      new Decimal(accumulator.investedAmount).plus(holding.costBasis)
    );
    accumulator.totalBuyCost = toText(
      new Decimal(accumulator.totalBuyCost).plus(holding.totalBuyCost)
    );
    accumulator.unrealizedProfit = toText(
      new Decimal(accumulator.unrealizedProfit).plus(holding.unrealizedProfit)
    );
    accumulator.totalProfit = toText(
      new Decimal(accumulator.totalProfit).plus(holding.totalProfit)
    );
    accumulator.realizedProfitApprox = toText(
      new Decimal(accumulator.realizedProfitApprox).plus(holding.realizedProfit)
    );
    accumulator.realizedProfit = accumulator.realizedProfitApprox;
    accumulator.totalFees = toText(new Decimal(accumulator.totalFees).plus(holding.totalFees));
    accumulator.stalePriceCount += holding.priceStatus === 'stale' ? 1 : 0;
    accumulator.missingPriceCount += holding.priceStatus === 'missing' ? 1 : 0;
    return accumulator;
  }, zeroTotals(baseCurrency));

  totals.fxWarningCount = transactions.filter(
    (transaction) => 'fxWarning' in transaction && transaction.fxWarning
  ).length;

  const totalBuyCost = new Decimal(totals.totalBuyCost);
  totals.roiPercent = totalBuyCost.gt(0)
    ? toText(new Decimal(totals.totalProfit).div(totalBuyCost).mul(100))
    : '0';

  const openHoldings = holdings.filter((holding) => new Decimal(holding.quantity).gt(0));
  const pricedOpenHoldings = openHoldings.filter((holding) => holding.priceStatus !== 'missing');
  const sortedByRoi = [...pricedOpenHoldings].sort((a, b) =>
    new Decimal(b.roiPercent).cmp(a.roiPercent)
  );

  return {
    totals,
    holdings,
    allocation: pricedOpenHoldings.map((holding) => ({
      label: holding.assetSymbol,
      value: holding.currentValue
    })),
    bestPerformer: sortedByRoi[0] ?? null,
    worstPerformer: sortedByRoi.at(-1) ?? null
  };
}
