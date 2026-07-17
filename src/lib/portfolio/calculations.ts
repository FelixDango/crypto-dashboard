import Decimal from 'decimal.js';
import type {
  Currency,
  HoldingSummary,
  PortfolioOverview,
  PortfolioTotals,
  PriceQuote
} from '$lib/types';
import { buildAverageCostLedger, type AverageCostTransaction } from '$lib/portfolio/averageCost';
import { moneyText, percentText, rateText } from '$lib/portfolio/decimal';

Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

function zeroTotals(baseCurrency: Currency): PortfolioTotals {
  return {
    baseCurrency,
    accountingMethod: 'average_cost',
    financialDataComplete: true,
    excludedTransactionCount: 0,
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

function decimal(value: string | null | undefined): Decimal {
  return value ? new Decimal(value) : new Decimal(0);
}

export function calculateHoldings(
  transactions: AverageCostTransaction[],
  quotes: PriceQuote[]
): HoldingSummary[] {
  const quoteByAsset = new Map(quotes.map((quote) => [quote.assetId, quote]));
  const ledger = buildAverageCostLedger(transactions);

  const preliminary = ledger.positions.map((position) => {
    const quantity = decimal(position.currentQuantity);
    const costBasis = decimal(position.costBasis);
    const realizedProfit = decimal(position.realizedProfit);
    const totalBuyCost = decimal(position.totalBuyCost);
    const quote = quoteByAsset.get(position.assetId);
    const hasOpenPosition = quantity.gt(0);
    const hasPrice = !hasOpenPosition || Boolean(quote && quote.capturedAt !== null);
    const currentPrice = hasOpenPosition && hasPrice ? decimal(quote?.price) : new Decimal(0);
    const currentValue = hasOpenPosition && hasPrice ? quantity.mul(currentPrice) : new Decimal(0);
    const unrealizedProfit =
      hasOpenPosition && hasPrice ? currentValue.minus(costBasis) : new Decimal(0);
    const totalProfit = unrealizedProfit.plus(realizedProfit);
    const roiPercent = totalBuyCost.gt(0) ? totalProfit.div(totalBuyCost).mul(100) : new Decimal(0);
    const priceStatus: HoldingSummary['priceStatus'] = !hasOpenPosition
      ? 'fresh'
      : !hasPrice
        ? 'missing'
        : quote?.stale
          ? 'stale'
          : 'fresh';

    return {
      assetId: position.assetId,
      assetSymbol: position.assetSymbol,
      assetName: position.assetName,
      imageUrl: position.imageUrl,
      quantity: position.currentQuantity,
      averageCost: position.averageCost,
      currentPrice: rateText(currentPrice),
      currentValue: moneyText(currentValue),
      totalBuyCost: position.totalBuyCost,
      costBasis: position.costBasis,
      unrealizedProfit: moneyText(unrealizedProfit),
      totalProfit: moneyText(totalProfit),
      roiPercent: percentText(roiPercent),
      realizedProfit: position.realizedProfit,
      realizedProfitApprox: position.realizedProfit,
      totalFees: position.totalFees,
      allocationPercent: '0',
      stalePrice: priceStatus === 'stale',
      priceSource: quote?.source ?? null,
      priceCapturedAt: quote?.capturedAt ?? null,
      priceStatus,
      ledger: position.ledger
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
        ? percentText(new Decimal(holding.currentValue).div(totalValue).mul(100))
        : '0'
    }))
    .sort((a, b) => new Decimal(b.currentValue).cmp(a.currentValue));
}

export function calculatePortfolio(
  transactions: AverageCostTransaction[],
  quotes: PriceQuote[],
  baseCurrency: Currency
): Pick<
  PortfolioOverview,
  'totals' | 'holdings' | 'allocation' | 'bestPerformer' | 'worstPerformer'
> {
  const incompleteTransactions = transactions.filter(
    (transaction) => 'fxComplete' in transaction && !transaction.fxComplete
  );
  const completeTransactions = transactions.filter(
    (transaction) => !('fxComplete' in transaction) || transaction.fxComplete
  );
  const holdings = calculateHoldings(completeTransactions, quotes);
  const totals = holdings.reduce((accumulator, holding) => {
    accumulator.currentValue = moneyText(
      new Decimal(accumulator.currentValue).plus(holding.currentValue)
    );
    accumulator.investedAmount = moneyText(
      new Decimal(accumulator.investedAmount).plus(holding.costBasis)
    );
    accumulator.totalBuyCost = moneyText(
      new Decimal(accumulator.totalBuyCost).plus(holding.totalBuyCost)
    );
    accumulator.unrealizedProfit = moneyText(
      new Decimal(accumulator.unrealizedProfit).plus(holding.unrealizedProfit)
    );
    accumulator.totalProfit = moneyText(
      new Decimal(accumulator.totalProfit).plus(holding.totalProfit)
    );
    accumulator.realizedProfit = moneyText(
      new Decimal(accumulator.realizedProfit).plus(holding.realizedProfit)
    );
    accumulator.realizedProfitApprox = accumulator.realizedProfit;
    accumulator.totalFees = moneyText(new Decimal(accumulator.totalFees).plus(holding.totalFees));
    accumulator.stalePriceCount += holding.priceStatus === 'stale' ? 1 : 0;
    accumulator.missingPriceCount += holding.priceStatus === 'missing' ? 1 : 0;
    return accumulator;
  }, zeroTotals(baseCurrency));

  totals.fxWarningCount = transactions.filter(
    (transaction) => 'fxWarning' in transaction && transaction.fxWarning
  ).length;
  totals.financialDataComplete =
    incompleteTransactions.length === 0 && totals.missingPriceCount === 0;
  totals.excludedTransactionCount = incompleteTransactions.length;

  const totalBuyCost = new Decimal(totals.totalBuyCost);
  totals.roiPercent = totalBuyCost.gt(0)
    ? percentText(new Decimal(totals.totalProfit).div(totalBuyCost).mul(100))
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
