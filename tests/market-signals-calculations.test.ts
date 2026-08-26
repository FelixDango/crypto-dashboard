import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  buildAssetSignalAssessment,
  calculateBollingerPosition,
  calculateDrawdown,
  calculateSmaDeviation,
  calculateWilderRsi
} from '$lib/market-signals/calculations';
import type {
  DailyMarketPoint,
  MarketSentiment,
  MarketSignalSettings
} from '$lib/market-signals/types';
import type { PlanningAllocationRow } from '$lib/planning/types';
import { marketSignalSettingsSchema } from '$lib/validation/market-signals';

const settings: MarketSignalSettings = {
  id: 1,
  fearGreedMax: '25',
  rsi14Max: '30',
  sma200DeviationMax: '-10',
  drawdown365Max: '-30',
  bollingerZMax: '-1.5',
  requiredFavorableCount: 4,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const sentiment: MarketSentiment = {
  provider: 'alternative.me',
  observedOn: '2026-08-25',
  value: '50',
  classification: 'Neutral',
  sourceUrl: 'https://alternative.me/crypto/fear-and-greed-index/',
  capturedAt: '2026-08-26T06:00:00.000Z'
};

function allocation(overrides: Partial<PlanningAllocationRow> = {}): PlanningAllocationRow {
  return {
    id: 'coingecko:bitcoin',
    provider: 'coingecko',
    providerCoinId: 'bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    imageUrl: null,
    currentValue: '200',
    currentAllocationPercentage: '20',
    targetPercentage: '60',
    driftPercentagePoints: '-40',
    fiatValueGap: '400',
    held: true,
    targeted: true,
    priceStatus: 'fresh',
    ...overrides
  };
}

function decliningPoints(count = 365): DailyMarketPoint[] {
  const start = new Date('2025-08-26T00:00:00.000Z');
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + index);
    return {
      assetId: 'coingecko:bitcoin',
      baseCurrency: 'EUR' as const,
      day: day.toISOString().slice(0, 10),
      close: new Decimal(500).minus(index).toString(),
      volume: '1000',
      source: 'coingecko',
      capturedAt: '2026-08-26T06:00:00.000Z'
    };
  });
}

function assessment(overrides: Partial<Parameters<typeof buildAssetSignalAssessment>[0]> = {}) {
  return buildAssetSignalAssessment({
    allocation: allocation(),
    baseCurrency: 'EUR',
    points: decliningPoints(),
    historyFresh: true,
    historyFreshnessReason: null,
    lastRefreshAt: '2026-08-26T06:00:00.000Z',
    sentiment,
    sentimentFresh: true,
    sentimentFreshnessReason: null,
    settings,
    planningComplete: true,
    planningFresh: true,
    ...overrides
  });
}

describe('market signal formulas', () => {
  it('uses Wilder smoothing for RSI (14)', () => {
    const closes = [
      '44.34',
      '44.09',
      '44.15',
      '43.61',
      '44.33',
      '44.83',
      '45.1',
      '45.42',
      '45.84',
      '46.08',
      '45.89',
      '46.03',
      '45.61',
      '46.28',
      '46.28'
    ];
    expect(new Decimal(calculateWilderRsi(closes)!).toDecimalPlaces(6).toString()).toBe(
      '70.464135'
    );
  });

  it('calculates SMA deviation, 365-day drawdown, and population Bollinger position', () => {
    const smaCloses = Array.from({ length: 200 }, (_, index) => String(index + 1));
    const drawdownCloses = [...Array.from({ length: 364 }, () => '100'), '50'];
    const bollingerCloses = [...Array.from({ length: 19 }, () => '10'), '0.0001'];

    expect(new Decimal(calculateSmaDeviation(smaCloses)!).toDecimalPlaces(12).toString()).toBe(
      '99.004975124378'
    );
    expect(calculateDrawdown(drawdownCloses)).toBe('-50');
    expect(
      new Decimal(calculateBollingerPosition(bollingerCloses)!).toDecimalPlaces(9).toString()
    ).toBe('-4.358898944');
  });

  it('treats exact threshold equality as favorable for all five signals', () => {
    const points = decliningPoints();
    const closes = points.map((point) => point.close);
    const equalSettings: MarketSignalSettings = {
      ...settings,
      fearGreedMax: '50',
      rsi14Max: calculateWilderRsi(closes)!,
      sma200DeviationMax: calculateSmaDeviation(closes)!,
      drawdown365Max: calculateDrawdown(closes)!,
      bollingerZMax: calculateBollingerPosition(closes)!,
      requiredFavorableCount: 5
    };
    const result = assessment({ points, settings: equalSettings });

    expect(result.signals.every((signal) => signal.state === 'favorable')).toBe(true);
    expect(result.candidate).toBe(true);
  });
});

describe('market signal candidate gate', () => {
  it('qualifies an underweight asset with four favorable fresh signals', () => {
    const result = assessment();
    expect(result.favorableCount).toBe(4);
    expect(result.allSignalsAvailable).toBe(true);
    expect(result.candidateLabel).toBe('Contribution candidate');
  });

  it('suppresses overweight, three-of-five, partial, missing, and stale assessments', () => {
    const overweight = assessment({
      allocation: allocation({ currentAllocationPercentage: '70', driftPercentagePoints: '10' })
    });
    const onlyThree = assessment({
      sentiment: { ...sentiment, value: '20' },
      settings: { ...settings, drawdown365Max: '-90', bollingerZMax: '-10' }
    });
    const partial = assessment({ planningComplete: false });
    const stalePortfolio = assessment({ planningFresh: false });
    const missing = assessment({ points: decliningPoints(364) });
    const staleHistory = assessment({
      historyFresh: false,
      historyFreshnessReason: 'Completed daily market history is over 36 hours stale.'
    });
    const staleSentiment = assessment({
      sentimentFresh: false,
      sentimentFreshnessReason: 'Fear & Greed data is over 48 hours stale.'
    });

    expect(overweight.candidate).toBe(false);
    expect(onlyThree.favorableCount).toBe(3);
    expect(onlyThree.candidate).toBe(false);
    expect(partial.candidate).toBe(false);
    expect(stalePortfolio.candidate).toBe(false);
    expect(stalePortfolio.reasons).toContain('Portfolio valuation uses stale current prices.');
    expect(missing.allSignalsAvailable).toBe(false);
    expect(missing.candidate).toBe(false);
    expect(staleHistory.candidate).toBe(false);
    expect(staleSentiment.candidate).toBe(false);
  });

  it('treats a positive target as underweight in a zero-value portfolio', () => {
    const result = assessment({
      allocation: allocation({
        currentValue: '0',
        currentAllocationPercentage: '0',
        driftPercentagePoints: '-60',
        fiatValueGap: '0',
        held: false
      })
    });
    expect(result.underweight).toBe(true);
    expect(result.candidate).toBe(true);
  });
});

describe('market signal settings validation', () => {
  it('accepts boundary values and rejects out-of-range values', () => {
    expect(
      marketSignalSettingsSchema.safeParse({
        fearGreedMax: '0',
        rsi14Max: '100',
        sma200DeviationMax: '-100',
        drawdown365Max: '0',
        bollingerZMax: '10',
        requiredFavorableCount: '5'
      }).success
    ).toBe(true);
    expect(
      marketSignalSettingsSchema.safeParse({
        fearGreedMax: '101',
        rsi14Max: '-1',
        sma200DeviationMax: '0',
        drawdown365Max: '1',
        bollingerZMax: '-11',
        requiredFavorableCount: '0'
      }).success
    ).toBe(false);
  });
});
