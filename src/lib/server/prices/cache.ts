import { and, asc, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AssetRecord, Currency, PriceQuote } from '$lib/types';
import { getPriceCacheTtlSeconds } from '$lib/env';
import { db } from '$lib/server/db/client';
import { priceSnapshots } from '$lib/server/db/schema';
import { getPriceProvider } from './providers';

type SnapshotRow = typeof priceSnapshots.$inferSelect;

function mapSnapshot(snapshot: SnapshotRow, stale: boolean, warning?: string): PriceQuote {
  return {
    assetId: snapshot.assetId,
    price: snapshot.price,
    currency: snapshot.fiatCurrency,
    source: snapshot.source,
    capturedAt: snapshot.capturedAt,
    stale,
    warning
  };
}

function latestSnapshot(assetId: string, currency: Currency): SnapshotRow | null {
  return (
    db
      .select()
      .from(priceSnapshots)
      .where(and(eq(priceSnapshots.assetId, assetId), eq(priceSnapshots.fiatCurrency, currency)))
      .orderBy(desc(priceSnapshots.capturedAt))
      .limit(1)
      .get() ?? null
  );
}

function snapshotIsFresh(snapshot: SnapshotRow): boolean {
  const ageMs = Date.now() - new Date(snapshot.capturedAt).getTime();
  return ageMs <= getPriceCacheTtlSeconds() * 1000;
}

export function getCachedPricesForAssets(
  assetRecords: AssetRecord[],
  currency: Currency,
  providerId = 'coingecko'
): PriceQuote[] {
  return assetRecords.map((asset) => {
    const snapshot = latestSnapshot(asset.id, currency);
    if (!snapshot) {
      return {
        assetId: asset.id,
        price: '0',
        currency,
        source: providerId,
        capturedAt: null,
        stale: true,
        warning: `${asset.symbol} has no cached price yet.`
      };
    }

    const stale = !snapshotIsFresh(snapshot);
    return mapSnapshot(
      snapshot,
      stale,
      stale ? `${asset.symbol} is using a stale cached price.` : undefined
    );
  });
}

export async function refreshCurrentPricesForAssets(
  assetRecords: AssetRecord[],
  currency: Currency,
  providerId = 'coingecko'
): Promise<PriceQuote[]> {
  if (assetRecords.length === 0) return [];

  const freshQuotes: PriceQuote[] = [];
  const staleSnapshots = new Map<string, SnapshotRow>();
  const needsFetch: AssetRecord[] = [];

  for (const asset of assetRecords) {
    const snapshot = latestSnapshot(asset.id, currency);
    if (snapshot && snapshotIsFresh(snapshot)) {
      freshQuotes.push(mapSnapshot(snapshot, false));
      continue;
    }

    if (snapshot) staleSnapshots.set(asset.id, snapshot);
    needsFetch.push(asset);
  }

  if (needsFetch.length === 0) return freshQuotes;

  const provider = getPriceProvider(providerId);
  try {
    const fetched = await provider.getCurrentPrices(
      needsFetch.map((asset) => asset.providerCoinId),
      currency
    );
    const byCoinId = new Map(fetched.map((price) => [price.providerCoinId, price]));
    const fetchedQuotes: PriceQuote[] = [];

    for (const asset of needsFetch) {
      const price = byCoinId.get(asset.providerCoinId);
      if (!price) {
        const stale = staleSnapshots.get(asset.id);
        if (stale) {
          fetchedQuotes.push(
            mapSnapshot(
              stale,
              true,
              `${asset.symbol} price was missing from the latest provider response.`
            )
          );
        } else {
          fetchedQuotes.push({
            assetId: asset.id,
            price: '0',
            currency,
            source: provider.id,
            capturedAt: null,
            stale: true,
            warning: `${asset.symbol} has no cached price yet.`
          });
        }
        continue;
      }

      const capturedAt = price.capturedAt ?? new Date().toISOString();
      db.insert(priceSnapshots)
        .values({
          id: randomUUID(),
          assetId: asset.id,
          fiatCurrency: currency,
          price: price.price,
          source: provider.id,
          capturedAt
        })
        .run();

      fetchedQuotes.push({
        assetId: asset.id,
        price: price.price,
        currency,
        source: provider.id,
        capturedAt,
        stale: false
      });
    }

    return [...freshQuotes, ...fetchedQuotes];
  } catch (error) {
    const warning = error instanceof Error ? error.message : 'Price provider failed.';
    const fallbackQuotes = needsFetch.map((asset) => {
      const stale = staleSnapshots.get(asset.id);
      if (stale) {
        return mapSnapshot(
          stale,
          true,
          `${asset.symbol} is using a stale cached price. ${warning}`
        );
      }

      return {
        assetId: asset.id,
        price: '0',
        currency,
        source: provider.id,
        capturedAt: null,
        stale: true,
        warning: `${asset.symbol} has no cached price yet. ${warning}`
      } satisfies PriceQuote;
    });

    return [...freshQuotes, ...fallbackQuotes];
  }
}

export async function getCurrentPricesForAssets(
  assetRecords: AssetRecord[],
  currency: Currency,
  providerId = 'coingecko'
): Promise<PriceQuote[]> {
  return refreshCurrentPricesForAssets(assetRecords, currency, providerId);
}

export async function getHistoricalPriceCached(
  asset: AssetRecord,
  date: string,
  currency: Currency,
  providerId = 'coingecko'
): Promise<PriceQuote> {
  const day = new Date(date);
  const capturedAt = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())
  ).toISOString();
  const cached = db
    .select()
    .from(priceSnapshots)
    .where(
      and(
        eq(priceSnapshots.assetId, asset.id),
        eq(priceSnapshots.fiatCurrency, currency),
        eq(priceSnapshots.capturedAt, capturedAt)
      )
    )
    .limit(1)
    .get();

  if (cached) return mapSnapshot(cached, false);

  const provider = getPriceProvider(providerId);
  const price = await provider.getHistoricalPrice(asset.providerCoinId, capturedAt, currency);
  db.insert(priceSnapshots)
    .values({
      id: randomUUID(),
      assetId: asset.id,
      fiatCurrency: currency,
      price: price.price,
      source: provider.id,
      capturedAt
    })
    .run();

  return {
    assetId: asset.id,
    price: price.price,
    currency,
    source: provider.id,
    capturedAt,
    stale: false
  };
}

export function listPriceSnapshots(currency: Currency) {
  return db
    .select()
    .from(priceSnapshots)
    .where(eq(priceSnapshots.fiatCurrency, currency))
    .orderBy(asc(priceSnapshots.capturedAt))
    .all();
}
