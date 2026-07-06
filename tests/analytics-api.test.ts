import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function resetDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-analytics-api-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.BASE_CURRENCY = 'EUR';
  process.env.PRICE_PROVIDER = 'coingecko';
  process.env.PRICE_CACHE_TTL_SECONDS = '600';
  process.env.INTERNAL_CRON_SECRET = 'test-secret';
}

describe('analytics API', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDatabase();
  });

  it('rejects invalid ranges', async () => {
    const { GET } = await import('../src/routes/api/analytics/performance/+server');

    const response = await GET({
      url: new URL('http://app/api/analytics/performance?range=forever')
    } as never);

    expect(response.status).toBe(400);
  });

  it('returns a safe empty summary', async () => {
    const { GET } = await import('../src/routes/api/analytics/summary/+server');

    const response = await GET();
    const payload = (await response.json()) as { currentValue: string; messages: string[] };

    expect(response.status).toBe(200);
    expect(payload.currentValue).toBe('0');
    expect(payload.messages[0]).toBe('No portfolio snapshots exist yet.');
  });

  it('rejects the internal health endpoint without a secret', async () => {
    const { POST } = await import('../src/routes/api/internal/analytics/health-check/+server');
    delete process.env.INTERNAL_CRON_SECRET;

    const response = await POST({
      request: new Request('http://app/api/internal/analytics/health-check', { method: 'POST' })
    } as never);

    expect(response.status).toBe(401);
  });

  it('rejects the internal health endpoint with the wrong secret', async () => {
    const { POST } = await import('../src/routes/api/internal/analytics/health-check/+server');

    const response = await POST({
      request: new Request('http://app/api/internal/analytics/health-check', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret' }
      })
    } as never);

    expect(response.status).toBe(401);
  });

  it('accepts the internal health endpoint with a valid secret', async () => {
    const { POST } = await import('../src/routes/api/internal/analytics/health-check/+server');

    const response = await POST({
      request: new Request('http://app/api/internal/analytics/health-check', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' }
      })
    } as never);
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe('ok');
  });
});
