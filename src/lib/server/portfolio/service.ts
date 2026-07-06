import type { HoldingSummary, PortfolioOverview, SnapshotRange } from '$lib/types';
import { calculatePortfolio } from '$lib/portfolio/calculations';
import { db } from '$lib/server/db/client';
import { assets, transactions } from '$lib/server/db/schema';
import { listTransactionsWithAssets } from '$lib/server/transactions';
import { getAppSettings } from '$lib/server/settings';
import { normalizeTransactions } from '$lib/server/fx/cache';
import { getCachedPricesForAssets } from '$lib/server/prices/cache';
import {
  ensurePortfolioAccounting,
  listLotDisposals,
  listOpenLots
} from '$lib/server/portfolio/accounting';
import { DEFAULT_SNAPSHOT_RANGE, listPortfolioSnapshotSeries } from './snapshots';

function activeAssets(holdings: HoldingSummary[]) {
  const rows = db.select().from(assets).all();
  const active = new Set(
    holdings.filter((holding) => Number(holding.quantity) > 0).map((h) => h.assetId)
  );
  return rows.filter((asset) => active.has(asset.id));
}

export async function getPortfolioOverview(
  options: { snapshotRange?: SnapshotRange } = {}
): Promise<PortfolioOverview> {
  await ensurePortfolioAccounting();
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
  const portfolioSnapshotSeries = listPortfolioSnapshotSeries(
    settings.baseCurrency,
    options.snapshotRange ?? DEFAULT_SNAPSHOT_RANGE
  );

  return {
    ...calculated,
    portfolioSeries: portfolioSnapshotSeries.points,
    portfolioSnapshotSeries,
    priceWarnings,
    fxWarnings
  };
}

export async function getAssetOverview(assetId: string) {
  const overview = await getPortfolioOverview();
  return overview.holdings.find((holding) => holding.assetId === assetId) ?? null;
}

export async function getAssetAccountingOverview(assetId: string) {
  const asset = await getAssetOverview(assetId);
  if (!asset) return null;

  return {
    asset,
    openLots: listOpenLots(assetId),
    disposals: listLotDisposals(assetId)
  };
}

export function getTransactionCount(): number {
  const row = db.select().from(transactions).all();
  return row.length;
}
