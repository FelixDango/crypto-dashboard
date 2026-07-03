import Decimal from 'decimal.js';
import type { ChartPoint, HoldingSummary, PortfolioOverview } from '$lib/types';
import { calculatePortfolio } from '$lib/portfolio/calculations';
import { db } from '$lib/server/db/client';
import { assets, transactions } from '$lib/server/db/schema';
import { listTransactionsWithAssets } from '$lib/server/transactions';
import { getAppSettings } from '$lib/server/settings';
import { normalizeTransactions } from '$lib/server/fx/cache';
import { getCachedPricesForAssets, listPriceSnapshots } from '$lib/server/prices/cache';

function activeAssets(holdings: HoldingSummary[]) {
  const rows = db.select().from(assets).all();
  const active = new Set(
    holdings.filter((holding) => Number(holding.quantity) > 0).map((h) => h.assetId)
  );
  return rows.filter((asset) => active.has(asset.id));
}

function buildPortfolioSeries(
  holdings: HoldingSummary[],
  baseCurrency: 'EUR' | 'USD'
): ChartPoint[] {
  const snapshots = listPriceSnapshots(baseCurrency);
  if (snapshots.length === 0) {
    const currentValue = holdings.reduce(
      (total, holding) => total.plus(holding.currentValue),
      new Decimal(0)
    );
    return [{ label: 'Now', value: currentValue.toString() }];
  }

  const quantityByAsset = new Map(
    holdings.map((holding) => [holding.assetId, new Decimal(holding.quantity)])
  );
  const latestPriceByAsset = new Map<string, Decimal>();
  const points = new Map<string, Decimal>();

  for (const snapshot of snapshots) {
    latestPriceByAsset.set(snapshot.assetId, new Decimal(snapshot.price));
    const label = new Date(snapshot.capturedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit'
    });

    const value = [...quantityByAsset.entries()].reduce((total, [assetId, quantity]) => {
      const price = latestPriceByAsset.get(assetId) ?? new Decimal(0);
      return total.plus(quantity.mul(price));
    }, new Decimal(0));

    points.set(label, value);
  }

  const series = [...points.entries()].slice(-30).map(([label, value]) => ({
    label,
    value: value.toDecimalPlaces(12).toString()
  }));

  return series.length > 0 ? series : [{ label: 'Now', value: '0' }];
}

export async function getPortfolioOverview(): Promise<PortfolioOverview> {
  const settings = getAppSettings();
  const transactionsWithAssets = listTransactionsWithAssets();
  const normalizedTransactions = await normalizeTransactions(
    transactionsWithAssets,
    settings.baseCurrency
  );

  const preliminary = calculatePortfolio(normalizedTransactions, [], settings.baseCurrency);
  const priceAssets = activeAssets(preliminary.holdings);
  const quotes = getCachedPricesForAssets(
    priceAssets,
    settings.baseCurrency,
    settings.priceProvider
  );
  const calculated = calculatePortfolio(normalizedTransactions, quotes, settings.baseCurrency);
  const priceWarnings = quotes.flatMap((quote) => (quote.warning ? [quote.warning] : []));
  const fxWarnings = normalizedTransactions.flatMap((transaction) =>
    transaction.fxWarning ? [transaction.fxWarning] : []
  );

  return {
    ...calculated,
    portfolioSeries: buildPortfolioSeries(calculated.holdings, settings.baseCurrency),
    priceWarnings,
    fxWarnings
  };
}

export async function getAssetOverview(assetId: string) {
  const overview = await getPortfolioOverview();
  return overview.holdings.find((holding) => holding.assetId === assetId) ?? null;
}

export function getTransactionCount(): number {
  const row = db.select().from(transactions).all();
  return row.length;
}
