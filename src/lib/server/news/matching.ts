import Decimal from 'decimal.js';
import { db } from '$lib/server/db/client';
import { assets, transactions, type AssetRow } from '$lib/server/db/schema';

export type NewsAssetMatchType = 'symbol' | 'name' | 'alias' | 'manual';

export type NewsAssetMatch = {
  assetId: string;
  matchType: NewsAssetMatchType;
  confidence: number;
  matchedTerms: string[];
};

type MatchLocation = 'title' | 'summary';

type MatchScore = {
  matchType: NewsAssetMatchType;
  confidence: number;
  term: string;
  location: MatchLocation;
};

const DISPLAY_THRESHOLD = 0.6;

const AMBIGUOUS_SYMBOLS = new Set([
  'A',
  'AI',
  'AMP',
  'BAT',
  'DATA',
  'HOT',
  'IN',
  'KEY',
  'ONE',
  'ON',
  'PAY',
  'SUN',
  'TON',
  'WAVES'
]);

const ALIASES_BY_SYMBOL: Record<string, string[]> = {
  ADA: ['Cardano'],
  AVAX: ['Avalanche'],
  BCH: ['Bitcoin Cash'],
  BNB: ['BNB Chain', 'Binance Coin'],
  BTC: ['Bitcoin', 'XBT'],
  DOGE: ['Dogecoin'],
  DOT: ['Polkadot'],
  ETH: ['Ethereum', 'Ether'],
  LINK: ['Chainlink'],
  LTC: ['Litecoin'],
  MATIC: ['Polygon'],
  POL: ['Polygon'],
  SOL: ['Solana'],
  TRX: ['Tron'],
  UNI: ['Uniswap'],
  USDC: ['USD Coin'],
  USDT: ['Tether'],
  XRP: ['Ripple', 'XRP Ledger']
};

function asDecimal(value: string | null | undefined): Decimal {
  if (!value) return new Decimal(0);
  return new Decimal(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueTerms(terms: string[]): string[] {
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}

function termRegex(term: string, flags = 'i'): RegExp {
  const escaped = escapeRegExp(term);
  const boundaryStart = /^[a-z0-9]/i.test(term) ? '(?<![a-z0-9])' : '';
  const boundaryEnd = /[a-z0-9]$/i.test(term) ? '(?![a-z0-9])' : '';
  return new RegExp(`${boundaryStart}${escaped}${boundaryEnd}`, flags);
}

function matchesTerm(text: string, term: string): boolean {
  if (!text || term.length < 2) return false;
  return termRegex(term).test(text);
}

function matchesSymbol(text: string, symbol: string): boolean {
  if (!text || symbol.length < 2) return false;
  return termRegex(symbol, '').test(text);
}

function assetAliases(asset: Pick<AssetRow, 'symbol' | 'name'>): string[] {
  const symbol = asset.symbol.toUpperCase();
  return uniqueTerms([...(ALIASES_BY_SYMBOL[symbol] ?? []), asset.name]);
}

function scoreFor(
  matchType: NewsAssetMatchType,
  location: MatchLocation,
  symbol: string,
  symbolOnly: boolean
): number {
  if (matchType === 'name' && location === 'title') return 0.95;
  if (matchType === 'alias' && location === 'title') return 0.9;
  if (matchType === 'symbol' && location === 'title') {
    return AMBIGUOUS_SYMBOLS.has(symbol) && symbolOnly ? 0.35 : 0.85;
  }
  if (matchType === 'name' && location === 'summary') return 0.75;
  if (matchType === 'alias' && location === 'summary') return 0.72;
  if (matchType === 'symbol' && location === 'summary') {
    return AMBIGUOUS_SYMBOLS.has(symbol) && symbolOnly ? 0.35 : 0.65;
  }
  return 0.35;
}

function collectScores(
  asset: Pick<AssetRow, 'id' | 'symbol' | 'name'>,
  title: string,
  summary: string
): MatchScore[] {
  const symbol = asset.symbol.toUpperCase();
  const locations: Array<{ location: MatchLocation; text: string }> = [
    { location: 'title', text: title },
    { location: 'summary', text: summary }
  ];
  const scores: MatchScore[] = [];

  for (const { location, text } of locations) {
    if (matchesTerm(text, asset.name)) {
      scores.push({
        matchType: 'name',
        confidence: scoreFor('name', location, symbol, false),
        term: asset.name,
        location
      });
    }

    for (const alias of assetAliases(asset)) {
      if (alias.toLowerCase() === asset.name.toLowerCase()) continue;
      if (!matchesTerm(text, alias)) continue;
      scores.push({
        matchType: 'alias',
        confidence: scoreFor('alias', location, symbol, false),
        term: alias,
        location
      });
    }
  }

  const hasNameOrAlias = scores.length > 0;
  for (const { location, text } of locations) {
    if (!matchesSymbol(text, symbol)) continue;
    scores.push({
      matchType: 'symbol',
      confidence: scoreFor('symbol', location, symbol, !hasNameOrAlias),
      term: symbol,
      location
    });
  }

  return scores;
}

export function matchArticleToAssets(
  article: { title: string; summary?: string | null },
  assetRows: Array<Pick<AssetRow, 'id' | 'symbol' | 'name'>>,
  threshold = DISPLAY_THRESHOLD
): NewsAssetMatch[] {
  const title = article.title ?? '';
  const summary = article.summary ?? '';

  return assetRows
    .map((asset) => {
      const scores = collectScores(asset, title, summary).sort(
        (a, b) => b.confidence - a.confidence
      );
      const best = scores[0];
      if (!best || best.confidence < threshold) return null;

      return {
        assetId: asset.id,
        matchType: best.matchType,
        confidence: best.confidence,
        matchedTerms: uniqueTerms(scores.map((score) => score.term))
      } satisfies NewsAssetMatch;
    })
    .filter((match): match is NewsAssetMatch => match !== null)
    .sort((a, b) => b.confidence - a.confidence);
}

export function listHeldAssetsForMatching(): AssetRow[] {
  const assetRows = db.select().from(assets).all();
  const balances = new Map<string, Decimal>();

  for (const row of db.select().from(transactions).all()) {
    const current = balances.get(row.assetId) ?? new Decimal(0);
    const quantity = asDecimal(row.quantity);
    balances.set(
      row.assetId,
      row.type === 'buy' ? current.plus(quantity) : current.minus(quantity)
    );
  }

  return assetRows.filter((asset) => (balances.get(asset.id) ?? new Decimal(0)).gt(0));
}
