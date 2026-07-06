import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function resetDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-insights-api-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.BASE_CURRENCY = 'EUR';
  process.env.PRICE_PROVIDER = 'coingecko';
  process.env.PRICE_CACHE_TTL_SECONDS = '600';
  process.env.INTERNAL_CRON_SECRET = 'test-secret';
}

describe('insights API', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDatabase();
  });

  it('returns the active custom cycle model', async () => {
    const { GET } = await import('../src/routes/api/insights/cycle/+server');

    const response = await GET({
      url: new URL('http://app/api/insights/cycle?date=2026-10-06')
    } as never);
    const payload = (await response.json()) as {
      settings: {
        name: string;
        recurringBullDurationDays: number;
        recurringBearDurationDays: number;
      };
      current: { phase: string; phaseStart: string };
    };

    expect(response.status).toBe(200);
    expect(payload.settings.name).toBe('Custom crypto cycle model');
    expect(payload.settings.recurringBullDurationDays).toBe(1064);
    expect(payload.settings.recurringBearDurationDays).toBe(365);
    expect(payload.current.phase).toBe('bull');
    expect(payload.current.phaseStart).toBe('2026-10-06');
  });

  it('rejects invalid cycle window ranges', async () => {
    const { GET } = await import('../src/routes/api/insights/cycle/windows/+server');

    const response = await GET({
      url: new URL('http://app/api/insights/cycle/windows?start=2026-10-06&end=2026-10-06')
    } as never);

    expect(response.status).toBe(400);
  });

  it('rejects invalid explain ranges', async () => {
    const { GET } = await import('../src/routes/api/insights/explain/+server');

    const response = await GET({
      url: new URL('http://app/api/insights/explain?range=90d')
    } as never);

    expect(response.status).toBe(400);
  });
});
