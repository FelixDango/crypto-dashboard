import { asc, eq, or, like } from 'drizzle-orm';
import type { AssetRecord } from '$lib/types';
import { db } from './db/client';
import { assets, type AssetRow } from './db/schema';
import { getPriceProvider } from './prices/providers';

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map<string, { expiresAt: number; results: AssetRecord[] }>();
const searchRequests = new Map<string, Promise<AssetRecord[]>>();

export type AssetInput = {
  provider?: string;
  providerCoinId: string;
  symbol: string;
  name: string;
  imageUrl?: string | null;
};

export const COMMON_ASSETS: AssetInput[] = [
  {
    providerCoinId: 'bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    imageUrl: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png'
  },
  {
    providerCoinId: 'ethereum',
    symbol: 'ETH',
    name: 'Ethereum',
    imageUrl: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png'
  },
  {
    providerCoinId: 'solana',
    symbol: 'SOL',
    name: 'Solana',
    imageUrl: 'https://coin-images.coingecko.com/coins/images/4128/large/solana.png'
  },
  {
    providerCoinId: 'chainlink',
    symbol: 'LINK',
    name: 'Chainlink',
    imageUrl: 'https://coin-images.coingecko.com/coins/images/877/large/chainlink-new-logo.png'
  }
];

export function createAssetId(provider: string, providerCoinId: string): string {
  const cleanProvider = provider.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const cleanCoin = providerCoinId.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return `${cleanProvider}:${cleanCoin}`;
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

export function listAssets(): AssetRecord[] {
  return db.select().from(assets).orderBy(asc(assets.symbol)).all().map(mapAsset);
}

export function upsertAsset(input: AssetInput): AssetRecord {
  const now = new Date().toISOString();
  const provider = input.provider ?? 'coingecko';
  const asset = {
    id: createAssetId(provider, input.providerCoinId),
    provider,
    providerCoinId: input.providerCoinId,
    symbol: input.symbol.toUpperCase(),
    name: input.name,
    imageUrl: input.imageUrl ?? null,
    createdAt: now,
    updatedAt: now
  };

  const updateSet = {
    symbol: asset.symbol,
    name: asset.name,
    updatedAt: now,
    ...(asset.imageUrl ? { imageUrl: asset.imageUrl } : {})
  };

  db.insert(assets)
    .values(asset)
    .onConflictDoUpdate({
      target: [assets.provider, assets.providerCoinId],
      set: updateSet
    })
    .run();

  const row = db.select().from(assets).where(eq(assets.id, asset.id)).get();
  if (!row) throw new Error('Failed to upsert asset.');
  return mapAsset(row);
}

export async function searchAssets(query: string): Promise<AssetRecord[]> {
  const cleaned = query.trim();
  if (cleaned.length < 2) {
    return COMMON_ASSETS.map((asset) =>
      mapAsset({
        id: createAssetId(asset.provider ?? 'coingecko', asset.providerCoinId),
        provider: asset.provider ?? 'coingecko',
        providerCoinId: asset.providerCoinId,
        symbol: asset.symbol,
        name: asset.name,
        imageUrl: asset.imageUrl ?? null,
        createdAt: '',
        updatedAt: ''
      })
    );
  }

  const pattern = `%${cleaned}%`;
  const local = db
    .select()
    .from(assets)
    .where(or(like(assets.symbol, pattern), like(assets.name, pattern)))
    .limit(10)
    .all()
    .map(mapAsset);

  const cacheKey = cleaned.toLowerCase();
  const cached = searchCache.get(cacheKey);
  let remote: AssetRecord[];
  if (cached && cached.expiresAt > Date.now()) {
    remote = cached.results;
  } else {
    let request = searchRequests.get(cacheKey);
    if (!request) {
      const provider = getPriceProvider('coingecko');
      request = provider.searchCoins(cleaned).catch(() => []);
      searchRequests.set(cacheKey, request);
    }
    try {
      remote = await request;
      searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, results: remote });
      if (searchCache.size > 100) searchCache.delete(searchCache.keys().next().value ?? cacheKey);
    } finally {
      if (searchRequests.get(cacheKey) === request) searchRequests.delete(cacheKey);
    }
  }
  const merged = [...local];
  const seen = new Set(local.map((asset) => `${asset.provider}:${asset.providerCoinId}`));

  for (const asset of remote) {
    const key = `${asset.provider}:${asset.providerCoinId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(asset);
  }

  return merged.slice(0, 12);
}
