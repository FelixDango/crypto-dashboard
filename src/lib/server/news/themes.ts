export type NewsTheme =
  | 'ETF'
  | 'regulation'
  | 'macro'
  | 'interest rates'
  | 'institutional adoption'
  | 'security/exploit'
  | 'exchange'
  | 'stablecoins'
  | 'DeFi'
  | 'staking'
  | 'upgrade'
  | 'lawsuit'
  | 'hack'
  | 'partnership'
  | 'token unlock'
  | 'liquidation'
  | 'mining'
  | 'on-chain';

export type NewsSentimentLabel = 'positive' | 'neutral' | 'negative' | 'mixed' | 'unknown';

const THEME_RULES: Array<{ theme: NewsTheme; keywords: string[] }> = [
  { theme: 'ETF', keywords: ['ETF', 'exchange-traded fund', 'fund flows', 'inflows', 'outflows'] },
  {
    theme: 'macro',
    keywords: ['Fed', 'Federal Reserve', 'inflation', 'CPI', 'jobs report', 'Treasury yields']
  },
  { theme: 'interest rates', keywords: ['rates', 'rate cut', 'rate hike', 'interest rate'] },
  { theme: 'regulation', keywords: ['SEC', 'regulation', 'MiCA', 'regulator', 'compliance'] },
  { theme: 'lawsuit', keywords: ['lawsuit', 'court', 'judge', 'settlement', 'sues', 'sued'] },
  {
    theme: 'institutional adoption',
    keywords: ['institutional', 'institution', 'BlackRock', 'Fidelity', 'treasury company']
  },
  {
    theme: 'security/exploit',
    keywords: ['exploit', 'breach', 'vulnerability', 'phishing', 'security incident']
  },
  { theme: 'hack', keywords: ['hack', 'hacker', 'hacked', 'stolen funds'] },
  { theme: 'exchange', keywords: ['exchange', 'Coinbase', 'Binance', 'Kraken', 'OKX', 'listing'] },
  { theme: 'stablecoins', keywords: ['stablecoin', 'USDT', 'USDC', 'Tether', 'Circle'] },
  { theme: 'DeFi', keywords: ['DeFi', 'protocol', 'DEX', 'lending protocol', 'yield'] },
  { theme: 'staking', keywords: ['staking', 'validator', 'restaking', 'staked'] },
  { theme: 'upgrade', keywords: ['upgrade', 'hard fork', 'mainnet', 'testnet', 'fork'] },
  {
    theme: 'partnership',
    keywords: ['partnership', 'partners with', 'integration', 'collaboration']
  },
  { theme: 'token unlock', keywords: ['token unlock', 'unlock', 'vesting'] },
  { theme: 'liquidation', keywords: ['liquidation', 'liquidations', 'leverage', 'margin'] },
  { theme: 'mining', keywords: ['mining', 'miner', 'hashrate', 'difficulty adjustment'] },
  { theme: 'on-chain', keywords: ['on-chain', 'wallet', 'reserve', 'netflow', 'open interest'] }
];

const POSITIVE_TERMS = [
  'approval',
  'approved',
  'inflow',
  'inflows',
  'partnership',
  'upgrade successful',
  'record high',
  'adoption',
  'launches',
  'integrates',
  'accumulates'
];

const NEGATIVE_TERMS = [
  'hack',
  'exploit',
  'lawsuit',
  'outflow',
  'outflows',
  'ban',
  'breach',
  'vulnerability',
  'liquidation',
  'liquidations',
  'stolen',
  'settlement',
  'charges',
  'declines'
];

const NEUTRAL_TERMS = ['unchanged', 'flat', 'steady', 'mixed trading', 'rangebound'];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordMatches(text: string, keyword: string): boolean {
  const escaped = escapeRegExp(keyword);
  const boundaryStart = /^[a-z0-9]/i.test(keyword) ? '(?<![a-z0-9])' : '';
  const boundaryEnd = /[a-z0-9]$/i.test(keyword) ? '(?![a-z0-9])' : '';
  return new RegExp(`${boundaryStart}${escaped}${boundaryEnd}`, 'i').test(text);
}

function countMatches(text: string, keywords: string[]): number {
  return keywords.filter((keyword) => keywordMatches(text, keyword)).length;
}

export function extractThemes(input: string): NewsTheme[] {
  const text = input.replace(/\s+/g, ' ').trim();
  if (!text) return [];

  return THEME_RULES.filter((rule) =>
    rule.keywords.some((keyword) => keywordMatches(text, keyword))
  ).map((rule) => rule.theme);
}

export function classifyContextLabel(input: string): NewsSentimentLabel {
  const text = input.replace(/\s+/g, ' ').trim();
  if (!text) return 'unknown';

  const positive = countMatches(text, POSITIVE_TERMS);
  const negative = countMatches(text, NEGATIVE_TERMS);
  const neutral = countMatches(text, NEUTRAL_TERMS);

  if (positive > 0 && negative > 0) return 'mixed';
  if (positive > 0) return 'positive';
  if (negative > 0) return 'negative';
  if (neutral > 0) return 'neutral';
  return 'unknown';
}
