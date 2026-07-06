import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function resetDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), 'krypto-dashboard-cycle-'));
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.BASE_CURRENCY = 'EUR';
  process.env.PRICE_PROVIDER = 'coingecko';
  process.env.PRICE_CACHE_TTL_SECONDS = '600';
  process.env.INTERNAL_CRON_SECRET = 'test-secret';
}

function utcDate(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

describe('custom market cycle model', () => {
  beforeEach(() => {
    vi.resetModules();
    resetDatabase();
  });

  it.each([
    ['2022-11-08', 'bull'],
    ['2025-10-05', 'bull'],
    ['2025-10-06', 'bear'],
    ['2026-10-05', 'bear'],
    ['2026-10-06', 'bull'],
    ['2029-09-03', 'bull'],
    ['2029-09-04', 'bear'],
    ['2030-09-03', 'bear'],
    ['2030-09-04', 'bull'],
    ['2033-08-02', 'bull'],
    ['2033-08-03', 'bear']
  ])('marks %s as %s', async (date, expectedPhase) => {
    const { getCurrentCyclePhase } = await import('../src/lib/server/insights/market-cycle');

    expect(getCurrentCyclePhase(utcDate(date))?.phase).toBe(expectedPhase);
  });

  it('uses half-open fixed historical windows', async () => {
    const { getCurrentCyclePhase } = await import('../src/lib/server/insights/market-cycle');

    expect(getCurrentCyclePhase(utcDate('2025-01-01'))).toMatchObject({
      phase: 'bull',
      phaseStart: '2022-11-08',
      phaseEndExclusive: '2025-10-06',
      visibleEndDate: '2025-10-05'
    });
    expect(getCurrentCyclePhase(utcDate('2025-10-06'))).toMatchObject({
      phase: 'bear',
      phaseStart: '2025-10-06',
      phaseEndExclusive: '2026-10-06',
      visibleEndDate: '2026-10-05'
    });
  });

  it('uses exact recurring day durations', async () => {
    const { getCurrentCyclePhase } = await import('../src/lib/server/insights/market-cycle');

    expect(getCurrentCyclePhase(utcDate('2026-10-06'))).toMatchObject({
      phase: 'bull',
      phaseStart: '2026-10-06',
      phaseEndExclusive: '2029-09-04',
      visibleEndDate: '2029-09-03',
      durationDays: 1064
    });
    expect(getCurrentCyclePhase(utcDate('2029-09-04'))).toMatchObject({
      phase: 'bear',
      phaseStart: '2029-09-04',
      phaseEndExclusive: '2030-09-04',
      visibleEndDate: '2030-09-03',
      durationDays: 365
    });
  });

  it('generates forward windows matching the custom model', async () => {
    const { generateCycleWindows } = await import('../src/lib/server/insights/market-cycle');

    const windows = generateCycleWindows(
      new Date('2026-10-06T00:00:00.000Z'),
      new Date('2034-08-03T00:00:00.000Z')
    );

    expect(
      windows.map((window) => [window.phase, window.phaseStart, window.visibleEndDate])
    ).toEqual([
      ['bull', '2026-10-06', '2029-09-03'],
      ['bear', '2029-09-04', '2030-09-03'],
      ['bull', '2030-09-04', '2033-08-02'],
      ['bear', '2033-08-03', '2034-08-02']
    ]);
  });

  it('calculates days remaining and progress without timezone drift', async () => {
    const { getCycleProgress } = await import('../src/lib/server/insights/market-cycle');

    const progress = getCycleProgress(new Date('2026-10-06T23:30:00.000Z'));

    expect(progress?.daysRemaining).toBe(1064);
    expect(progress?.progressPercent).toBe(0);
    expect(progress?.nextTransition).toMatchObject({
      date: '2029-09-04',
      phase: 'bear'
    });
  });
});
