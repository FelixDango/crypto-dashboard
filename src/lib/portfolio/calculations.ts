import Decimal from 'decimal.js';
import type {
  Currency,
  HoldingSummary,
  PortfolioOverview,
  PortfolioTotals,
  PriceQuote,
  TransactionRecord
} from '$lib/types';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

type MutableHolding = {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  imageUrl: string | null;
  totalBuyCost: Decimal;
  totalQuantityBought: Decimal;
  totalQuantitySold: Decimal;
  sellProceeds: Decimal;
  sellFees: Decimal;
};

function zeroTotals(baseCurrency: Currency): PortfolioTotals {
  return {
    baseCurrency,
    currentValue: '0',
    investedAmount: '0',
    totalBuyCost: '0',
    unrealizedProfit: '0',
    roiPercent: '0',
    realizedProfitApprox: '0',
    stalePriceCount: 0
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

export function calculateHoldings(
  transactions: TransactionRecord[],
  quotes: PriceQuote[]
): HoldingSummary[] {
  const quoteByAsset = new Map(quotes.map((quote) => [quote.assetId, quote]));
  const grouped = new Map<string, MutableHolding>();

  for (const transaction of transactions) {
    const existing =
      grouped.get(transaction.assetId) ??
      ({
        assetId: transaction.assetId,
        assetSymbol: transaction.assetSymbol,
        assetName: transaction.assetName,
        imageUrl: transaction.asset?.imageUrl ?? null,
        totalBuyCost: new Decimal(0),
        totalQuantityBought: new Decimal(0),
        totalQuantitySold: new Decimal(0),
        sellProceeds: new Decimal(0),
        sellFees: new Decimal(0)
      } satisfies MutableHolding);

    const quantity = asDecimal(transaction.quantity);
    const fiatAmount = asDecimal(transaction.fiatAmount);
    const feeAmount = asDecimal(transaction.feeAmount);

    if (transaction.type === 'buy') {
      existing.totalBuyCost = existing.totalBuyCost.plus(fiatAmount).plus(feeAmount);
      existing.totalQuantityBought = existing.totalQuantityBought.plus(quantity);
    } else {
      existing.totalQuantitySold = existing.totalQuantitySold.plus(quantity);
      existing.sellProceeds = existing.sellProceeds.plus(fiatAmount.minus(feeAmount));
      existing.sellFees = existing.sellFees.plus(feeAmount);
    }

    grouped.set(transaction.assetId, existing);
  }

  const preliminary = [...grouped.values()].map((holding) => {
    const averageCost = holding.totalQuantityBought.gt(0)
      ? holding.totalBuyCost.div(holding.totalQuantityBought)
      : new Decimal(0);
    const currentQuantity = Decimal.max(
      holding.totalQuantityBought.minus(holding.totalQuantitySold),
      new Decimal(0)
    );
    const quote = quoteByAsset.get(holding.assetId);
    const currentPrice = asDecimal(quote?.price);
    const currentValue = currentQuantity.mul(currentPrice);
    const costBasis = currentQuantity.mul(averageCost);
    const unrealizedProfit = currentValue.minus(costBasis);
    const roiPercent = costBasis.gt(0) ? unrealizedProfit.div(costBasis).mul(100) : new Decimal(0);
    const realizedProfitApprox = holding.sellProceeds.minus(
      holding.totalQuantitySold.mul(averageCost)
    );

    return {
      assetId: holding.assetId,
      assetSymbol: holding.assetSymbol,
      assetName: holding.assetName,
      imageUrl: holding.imageUrl,
      quantity: toText(currentQuantity),
      averageCost: toText(averageCost),
      currentPrice: toText(currentPrice),
      currentValue: toText(currentValue),
      totalBuyCost: toText(holding.totalBuyCost),
      costBasis: toText(costBasis),
      unrealizedProfit: toText(unrealizedProfit),
      roiPercent: toText(roiPercent),
      realizedProfitApprox: toText(realizedProfitApprox),
      allocationPercent: '0',
      stalePrice: quote?.stale ?? false
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
  transactions: TransactionRecord[],
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
    accumulator.realizedProfitApprox = toText(
      new Decimal(accumulator.realizedProfitApprox).plus(holding.realizedProfitApprox)
    );
    accumulator.stalePriceCount += holding.stalePrice ? 1 : 0;
    return accumulator;
  }, zeroTotals(baseCurrency));

  const investedAmount = new Decimal(totals.investedAmount);
  totals.roiPercent = investedAmount.gt(0)
    ? toText(new Decimal(totals.unrealizedProfit).div(investedAmount).mul(100))
    : '0';

  const openHoldings = holdings.filter((holding) => new Decimal(holding.quantity).gt(0));
  const sortedByRoi = [...openHoldings].sort((a, b) => new Decimal(b.roiPercent).cmp(a.roiPercent));

  return {
    totals,
    holdings,
    allocation: openHoldings.map((holding) => ({
      label: holding.assetSymbol,
      value: holding.currentValue
    })),
    bestPerformer: sortedByRoi[0] ?? null,
    worstPerformer: sortedByRoi.at(-1) ?? null
  };
}
