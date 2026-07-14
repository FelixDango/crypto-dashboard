import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRssFeed } from '../src/lib/server/news/rss';
import { matchArticleToAssets } from '../src/lib/server/news/matching';
import { classifyContextLabel, extractThemes } from '../src/lib/server/news/themes';
import type { NewsProvider, NewsSource } from '../src/lib/server/news/provider';

function resetDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-news-engine-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.BASE_CURRENCY = 'EUR';
  process.env.PRICE_PROVIDER = 'coingecko';
  process.env.PRICE_CACHE_TTL_SECONDS = '600';
  process.env.INTERNAL_CRON_SECRET = 'test-secret';
}

async function seedHeldBitcoin() {
  const { createTransaction } = await import('../src/lib/server/transactions');

  await createTransaction({
    asset: {
      provider: 'coingecko',
      providerCoinId: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin'
    },
    type: 'buy',
    quantity: '1',
    fiatAmount: '100',
    fiatCurrency: 'EUR',
    feeAmount: '0',
    feeCurrency: 'EUR',
    transactionDate: '2026-07-06T10:00:00.000Z'
  });
}

async function insertTestSource() {
  const { db } = await import('../src/lib/server/db/client');
  const { newsSources } = await import('../src/lib/server/db/schema');
  const now = '2026-07-06T10:00:00.000Z';

  db.update(newsSources).set({ isEnabled: false, updatedAt: now }).run();
  db.insert(newsSources)
    .values({
      id: 'test-source',
      name: 'Test Source',
      type: 'rss',
      url: 'https://example.test/feed.xml',
      isEnabled: true,
      fetchIntervalMinutes: 60,
      createdAt: now,
      updatedAt: now
    })
    .run();
}

async function insertMatchedArticle(input: {
  title: string;
  themes: string[];
  publishedAt: string;
}) {
  const { db } = await import('../src/lib/server/db/client');
  const { newsArticles, newsArticleAssetMatches } = await import('../src/lib/server/db/schema');
  const id = randomUUID();

  db.insert(newsArticles)
    .values({
      id,
      sourceId: 'test-source',
      externalId: id,
      url: `https://example.test/${id}`,
      canonicalUrl: `https://example.test/${id}`,
      title: input.title,
      summary: null,
      publishedAt: input.publishedAt,
      fetchedAt: input.publishedAt,
      language: 'en',
      rawAssetMentionsJson: null,
      rawThemesJson: JSON.stringify(input.themes),
      sentimentLabel: 'neutral',
      createdAt: input.publishedAt,
      updatedAt: input.publishedAt
    })
    .run();
  db.insert(newsArticleAssetMatches)
    .values({
      id: randomUUID(),
      articleId: id,
      assetId: 'coingecko:bitcoin',
      matchType: 'name',
      confidence: 0.95,
      matchedTermsJson: JSON.stringify(['Bitcoin']),
      createdAt: input.publishedAt
    })
    .run();
}

async function insertUnmatchedArticle(input: {
  title: string;
  summary?: string | null;
  themes: string[];
  publishedAt: string;
}) {
  const { db } = await import('../src/lib/server/db/client');
  const { newsArticles } = await import('../src/lib/server/db/schema');
  const id = randomUUID();

  db.insert(newsArticles)
    .values({
      id,
      sourceId: 'test-source',
      externalId: id,
      url: `https://example.test/${id}`,
      canonicalUrl: `https://example.test/${id}`,
      title: input.title,
      summary: input.summary ?? null,
      publishedAt: input.publishedAt,
      fetchedAt: input.publishedAt,
      language: 'en',
      rawAssetMentionsJson: null,
      rawThemesJson: JSON.stringify(input.themes),
      sentimentLabel: 'unknown',
      createdAt: input.publishedAt,
      updatedAt: input.publishedAt
    })
    .run();
}

describe('RSS parsing', () => {
  it('parses a valid RSS feed', () => {
    const articles = parseRssFeed(
      `
      <rss><channel><language>en</language>
        <item>
          <guid>btc-etf</guid>
          <title><![CDATA[Bitcoin ETF inflows rise]]></title>
          <link>https://example.test/btc-etf#comments</link>
          <pubDate>Mon, 06 Jul 2026 12:00:00 GMT</pubDate>
          <description><![CDATA[<p>Fund flows increased.</p>]]></description>
        </item>
      </channel></rss>
    `,
      'Example'
    );

    expect(articles).toHaveLength(1);
    expect(articles[0].externalId).toBe('btc-etf');
    expect(articles[0].url).toBe('https://example.test/btc-etf');
    expect(articles[0].summary).toBe('Fund flows increased.');
    expect(articles[0].language).toBe('en');
  });

  it('handles a broken feed gracefully', () => {
    expect(parseRssFeed('<rss><channel><item><title>Missing link</title></item>')).toEqual([]);
  });
});

describe('news matching and labeling rules', () => {
  const btc = { id: 'coingecko:bitcoin', symbol: 'BTC', name: 'Bitcoin' };
  const eth = { id: 'coingecko:ethereum', symbol: 'ETH', name: 'Ethereum' };
  const ai = { id: 'coingecko:sleepless-ai', symbol: 'AI', name: 'Sleepless AI' };

  it('matches BTC and Ethereum titles', () => {
    expect(matchArticleToAssets({ title: 'Bitcoin ETF inflows rise' }, [btc])[0].assetId).toBe(
      btc.id
    );
    expect(
      matchArticleToAssets({ title: 'Ethereum upgrade reaches mainnet' }, [eth])[0].assetId
    ).toBe(eth.id);
  });

  it('does not display ambiguous short symbol-only matches', () => {
    expect(matchArticleToAssets({ title: 'AI demand appears across markets' }, [ai])).toEqual([]);
  });

  it('scores title matches above summary matches', () => {
    const titleMatch = matchArticleToAssets({ title: 'Bitcoin ETF inflows rise', summary: '' }, [
      btc
    ])[0];
    const summaryMatch = matchArticleToAssets(
      { title: 'Market update', summary: 'Bitcoin ETF inflows rise' },
      [btc]
    )[0];

    expect(titleMatch.confidence).toBeGreaterThan(summaryMatch.confidence);
  });

  it('extracts deterministic themes', () => {
    expect(extractThemes('Spot ETF fund flows climbed')).toContain('ETF');
    expect(extractThemes('Fed rates and CPI dominate markets')).toEqual(
      expect.arrayContaining(['macro', 'interest rates'])
    );
    expect(extractThemes('Protocol exploit leads to hack report')).toEqual(
      expect.arrayContaining(['security/exploit', 'hack'])
    );
    expect(extractThemes('SEC lawsuit enters court')).toEqual(
      expect.arrayContaining(['regulation', 'lawsuit'])
    );
  });

  it('assigns conservative context labels', () => {
    expect(classifyContextLabel('ETF approval and inflows')).toBe('positive');
    expect(classifyContextLabel('Hack and exploit reported')).toBe('negative');
    expect(classifyContextLabel('Approval follows exploit report')).toBe('mixed');
    expect(classifyContextLabel('Bitcoin market update')).toBe('unknown');
  });
});

describe('news ingestion and context generation', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDatabase();
  });

  it('inserts, updates, matches, and records fetch events', async () => {
    await seedHeldBitcoin();
    await insertTestSource();
    let title = 'Bitcoin ETF inflows rise';
    const provider: NewsProvider = {
      async fetchSource(source: NewsSource) {
        return [
          {
            externalId: 'btc-etf',
            url: `${source.url}/btc-etf`,
            title,
            summary: 'Recent related headlines mention ETF fund flows.',
            publishedAt: new Date('2026-07-06T12:00:00.000Z'),
            sourceName: source.name,
            language: 'en'
          }
        ];
      }
    };
    const { fetchDueNews } = await import('../src/lib/server/news/ingest');

    const first = await fetchDueNews({ provider, onlyDue: false });
    title = 'Bitcoin ETF inflows continue';
    const second = await fetchDueNews({ provider, onlyDue: false });
    const { getSqlite } = await import('../src/lib/server/db/client');
    const sqlite = getSqlite();

    expect(first.articlesInserted).toBe(1);
    expect(first.matchesCreated).toBe(1);
    expect(second.articlesInserted).toBe(0);
    expect(second.articlesUpdated).toBe(1);
    expect(
      (sqlite.prepare('SELECT COUNT(*) AS count FROM news_articles').get() as { count: number })
        .count
    ).toBe(1);
    expect(
      (sqlite.prepare('SELECT COUNT(*) AS count FROM news_fetch_events').get() as { count: number })
        .count
    ).toBe(2);
  });

  it('ranks themes, prefers recent articles, and includes the disclaimer', async () => {
    await seedHeldBitcoin();
    await insertTestSource();
    await insertMatchedArticle({
      title: 'Older macro story mentions Bitcoin',
      themes: ['macro'],
      publishedAt: '2026-07-04T12:00:00.000Z'
    });
    await insertMatchedArticle({
      title: 'Recent Bitcoin ETF story',
      themes: ['ETF'],
      publishedAt: '2026-07-06T12:00:00.000Z'
    });
    await insertMatchedArticle({
      title: 'Another Bitcoin ETF headline',
      themes: ['ETF'],
      publishedAt: '2026-07-05T12:00:00.000Z'
    });
    const { getAssetNewsContext, getNewsThemesByAsset } =
      await import('../src/lib/server/news/context');

    const themes = getNewsThemesByAsset('coingecko:bitcoin', '7d', {
      now: new Date('2026-07-07T12:00:00.000Z')
    });
    const context = getAssetNewsContext('coingecko:bitcoin', '7d', {
      now: new Date('2026-07-07T12:00:00.000Z')
    });

    expect(themes[0]).toBe('ETF');
    expect(context.asset?.articles[0].title).toBe('Recent Bitcoin ETF story');
    expect(context.disclaimer).toContain('does not prove causation');
    for (const forbidden of ['caused', 'because', `should ${'buy'}`, `should ${'sell'}`]) {
      expect(context.asset?.contextSummary.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('filters news by query and matched-only state and builds dashboard stats', async () => {
    await seedHeldBitcoin();
    await insertTestSource();
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const older = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await insertMatchedArticle({
      title: 'Bitcoin ETF inflows rise again',
      themes: ['ETF'],
      publishedAt: recent
    });
    await insertUnmatchedArticle({
      title: 'Stablecoin policy update reaches committee',
      summary: 'General crypto policy without a held-asset mention.',
      themes: ['stablecoins', 'regulation'],
      publishedAt: older
    });
    const { listNewsArticles } = await import('../src/lib/server/news/context');
    const { getNewsDashboardData } = await import('../src/lib/server/news/dashboard');

    const matchedOnly = listNewsArticles({
      range: '7d',
      q: 'ETF',
      matchedOnly: true,
      now: new Date()
    });
    const unmatchedPolicy = listNewsArticles({
      range: '7d',
      q: 'policy',
      matchedOnly: false,
      now: new Date()
    });
    const dashboard = await getNewsDashboardData({
      range: '7d',
      assetId: '',
      sourceId: '',
      theme: '',
      sentimentLabel: null,
      q: '',
      matchedOnly: false,
      sort: 'latest'
    });

    expect(matchedOnly).toHaveLength(1);
    expect(matchedOnly[0].title).toContain('Bitcoin ETF');
    expect(unmatchedPolicy).toHaveLength(1);
    expect(unmatchedPolicy[0].matchedAssets).toHaveLength(0);
    expect(dashboard.stats.totalArticles).toBe(2);
    expect(dashboard.stats.matchedArticles).toBe(1);
    expect(dashboard.themes.map((theme) => theme.theme)).toEqual(
      expect.arrayContaining(['ETF', 'regulation', 'stablecoins'])
    );
    expect(dashboard.sources.find((source) => source.id === 'test-source')?.articlesInRange).toBe(
      2
    );
  });
});
