import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function resetDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-news-api-'));
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

async function insertMatchedArticle() {
  const { db } = await import('../src/lib/server/db/client');
  const { newsArticles, newsArticleAssetMatches } = await import('../src/lib/server/db/schema');
  const id = randomUUID();
  const now = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  db.insert(newsArticles)
    .values({
      id,
      sourceId: 'coindesk',
      externalId: id,
      url: `https://example.test/${id}`,
      canonicalUrl: `https://example.test/${id}`,
      title: 'Bitcoin ETF flows appear across headlines',
      summary: 'Recent related headlines mention ETF flows.',
      publishedAt: now,
      fetchedAt: now,
      language: 'en',
      rawAssetMentionsJson: null,
      rawThemesJson: JSON.stringify(['ETF']),
      sentimentLabel: 'positive',
      createdAt: now,
      updatedAt: now
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
      createdAt: now
    })
    .run();
}

describe('news API', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDatabase();
  });

  it('rejects invalid ranges', async () => {
    const { GET } = await import('../src/routes/api/news/articles/+server');

    const response = await GET({
      url: new URL('http://app/api/news/articles?range=forever')
    } as never);

    expect(response.status).toBe(400);
  });

  it('returns safe empty article state', async () => {
    const { GET } = await import('../src/routes/api/news/articles/+server');

    const response = await GET({
      url: new URL('http://app/api/news/articles?range=24h')
    } as never);
    const payload = (await response.json()) as { articles: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.articles).toEqual([]);
  });

  it('returns asset news context', async () => {
    await seedHeldBitcoin();
    await insertMatchedArticle();
    const { GET } = await import('../src/routes/api/news/context/[assetId]/+server');

    const response = await GET({
      params: { assetId: 'coingecko:bitcoin' },
      url: new URL('http://app/api/news/context/coingecko%3Abitcoin?range=7d')
    } as never);
    const payload = (await response.json()) as {
      asset: { symbol: string; articles: Array<{ title: string }> };
      disclaimer: string;
    };

    expect(response.status).toBe(200);
    expect(payload.asset.symbol).toBe('BTC');
    expect(payload.asset.articles[0].title).toContain('Bitcoin ETF');
    expect(payload.disclaimer).toContain('does not prove causation');
  });

  it('returns news health', async () => {
    const { GET } = await import('../src/routes/api/news/health/+server');

    const response = GET();
    const payload = (await response.json()) as {
      enabledSources: number;
      pendingSources: number;
      status: string;
      sources: Array<{ isEnabled: boolean; status: string }>;
    };
    const enabledSources = payload.sources.filter((source) => source.isEnabled);

    expect(response.status).toBe(200);
    expect(payload.enabledSources).toBeGreaterThan(0);
    expect(payload.pendingSources).toBe(payload.enabledSources);
    expect(enabledSources.every((source) => source.status === 'pending')).toBe(true);
    expect(payload.status).toBe('warning');
  });

  it('marks attempted total news failure as broken', async () => {
    const { db } = await import('../src/lib/server/db/client');
    const { newsSources } = await import('../src/lib/server/db/schema');
    db.update(newsSources)
      .set({
        lastFetchedAt: '2026-07-06T12:00:00.000Z',
        lastError: 'fetch failed',
        updatedAt: '2026-07-06T12:00:00.000Z'
      })
      .run();
    const { GET } = await import('../src/routes/api/news/health/+server');

    const response = GET();
    const payload = (await response.json()) as {
      enabledSources: number;
      failedSources: number;
      status: string;
      sources: Array<{ isEnabled: boolean; status: string }>;
    };
    const enabledSources = payload.sources.filter((source) => source.isEnabled);

    expect(response.status).toBe(200);
    expect(payload.failedSources).toBe(payload.enabledSources);
    expect(enabledSources.every((source) => source.status === 'broken')).toBe(true);
    expect(payload.status).toBe('broken');
  });

  it('rejects the internal fetch endpoint without a secret', async () => {
    const { POST } = await import('../src/routes/api/internal/news/fetch/+server');
    delete process.env.INTERNAL_CRON_SECRET;

    const response = await POST({
      request: new Request('http://app/api/internal/news/fetch', { method: 'POST' })
    } as never);

    expect(response.status).toBe(401);
  });

  it('rejects the internal fetch endpoint with the wrong secret', async () => {
    const { POST } = await import('../src/routes/api/internal/news/fetch/+server');

    const response = await POST({
      request: new Request('http://app/api/internal/news/fetch', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret' }
      })
    } as never);

    expect(response.status).toBe(401);
  });

  it('accepts the internal fetch endpoint with a valid secret', async () => {
    const { db } = await import('../src/lib/server/db/client');
    const { newsSources } = await import('../src/lib/server/db/schema');
    db.update(newsSources).set({ isEnabled: false, updatedAt: '2026-07-06T12:00:00.000Z' }).run();
    const { POST } = await import('../src/routes/api/internal/news/fetch/+server');

    const response = await POST({
      request: new Request('http://app/api/internal/news/fetch', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' }
      })
    } as never);
    const payload = (await response.json()) as { status: string; sourcesChecked: number };

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.sourcesChecked).toBe(0);
  });
});
