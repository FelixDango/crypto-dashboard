import Decimal from 'decimal.js';
import type { PlanningAllocationRow } from '$lib/planning/types';
import type {
  AssetSignalAssessment,
  DailyMarketPoint,
  MarketSentiment,
  MarketSignalKey,
  MarketSignalSettings,
  SignalDatum
} from './types';

const RSI_PERIOD = 14;
const SMA_PERIOD = 200;
const DRAWDOWN_PERIOD = 365;
const BOLLINGER_PERIOD = 20;

function decimal(value: string): Decimal | null {
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function result(value: Decimal): string {
  return value.toSignificantDigits(20).toString();
}

function validCloses(closes: string[]): Decimal[] | null {
  const parsed = closes.map(decimal);
  return parsed.every((value): value is Decimal => value !== null && value.gt(0)) ? parsed : null;
}

export function calculateWilderRsi(closes: string[], period = RSI_PERIOD): string | null {
  const values = validCloses(closes);
  if (!values || period < 1 || values.length < period + 1) return null;

  let averageGain = new Decimal(0);
  let averageLoss = new Decimal(0);
  for (let index = 1; index <= period; index += 1) {
    const change = values[index].minus(values[index - 1]);
    if (change.isPositive()) averageGain = averageGain.plus(change);
    if (change.isNegative()) averageLoss = averageLoss.plus(change.abs());
  }
  averageGain = averageGain.div(period);
  averageLoss = averageLoss.div(period);

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index].minus(values[index - 1]);
    const gain = change.isPositive() ? change : new Decimal(0);
    const loss = change.isNegative() ? change.abs() : new Decimal(0);
    averageGain = averageGain
      .times(period - 1)
      .plus(gain)
      .div(period);
    averageLoss = averageLoss
      .times(period - 1)
      .plus(loss)
      .div(period);
  }

  if (averageGain.isZero() && averageLoss.isZero()) return '50';
  if (averageLoss.isZero()) return '100';
  if (averageGain.isZero()) return '0';

  return result(
    new Decimal(100).minus(new Decimal(100).div(new Decimal(1).plus(averageGain.div(averageLoss))))
  );
}

export function calculateSmaDeviation(closes: string[], period = SMA_PERIOD): string | null {
  const values = validCloses(closes.slice(-period));
  if (!values || period < 1 || values.length < period) return null;
  const average = Decimal.sum(...values).div(period);
  return result(values.at(-1)!.div(average).minus(1).times(100));
}

export function calculateDrawdown(closes: string[], period = DRAWDOWN_PERIOD): string | null {
  const values = validCloses(closes.slice(-period));
  if (!values || period < 1 || values.length < period) return null;
  const highest = Decimal.max(...values);
  return result(values.at(-1)!.div(highest).minus(1).times(100));
}

export function calculateBollingerPosition(
  closes: string[],
  period = BOLLINGER_PERIOD
): string | null {
  const values = validCloses(closes.slice(-period));
  if (!values || period < 1 || values.length < period) return null;
  const average = Decimal.sum(...values).div(period);
  const variance = Decimal.sum(...values.map((value) => value.minus(average).pow(2))).div(period);
  const standardDeviation = variance.sqrt();
  if (standardDeviation.isZero()) return '0';
  return result(values.at(-1)!.minus(average).div(standardDeviation));
}

const labels: Record<MarketSignalKey, string> = {
  fear_greed: 'Crypto Fear & Greed',
  rsi_14: 'RSI (14)',
  sma_200_deviation: '200-day SMA deviation',
  drawdown_365: '365-day drawdown',
  bollinger_20_z: '20-day Bollinger position'
};

const explanations: Record<MarketSignalKey, string> = {
  fear_greed:
    'Bitcoin-wide market sentiment from Alternative.me. Lower values indicate more fearful conditions.',
  rsi_14:
    'Wilder-smoothed RSI compares recent gains and losses. Lower values indicate weaker momentum.',
  sma_200_deviation:
    'Percentage distance between the latest close and its 200-day simple moving average.',
  drawdown_365: 'Percentage decline from the highest completed daily close in the last 365 days.',
  bollinger_20_z:
    'Latest close measured in population standard deviations from its 20-day simple moving average.'
};

function signal(input: {
  key: MarketSignalKey;
  value: string | null;
  threshold: string;
  unit: SignalDatum['unit'];
  fresh: boolean;
  asOf: string | null;
  unavailableReason?: string | null;
}): SignalDatum {
  const value = input.value === null ? null : decimal(input.value);
  const threshold = decimal(input.threshold);
  const available = value !== null && threshold !== null && input.fresh;
  const favorable = available && value.lte(threshold);

  return {
    key: input.key,
    label: labels[input.key],
    value: value === null ? null : result(value),
    threshold: input.threshold,
    unit: input.unit,
    state: available ? (favorable ? 'favorable' : 'neutral') : 'unavailable',
    favorable,
    fresh: input.fresh,
    asOf: input.asOf,
    explanation: explanations[input.key],
    unavailableReason: available
      ? null
      : (input.unavailableReason ??
        (input.fresh ? 'Not enough completed daily data.' : 'The source data is stale.'))
  };
}

export type BuildAssetSignalAssessmentInput = {
  allocation: PlanningAllocationRow;
  baseCurrency: 'EUR' | 'USD';
  points: DailyMarketPoint[];
  historyFresh: boolean;
  historyFreshnessReason: string | null;
  lastRefreshAt: string | null;
  sentiment: MarketSentiment | null;
  sentimentFresh: boolean;
  sentimentFreshnessReason: string | null;
  settings: MarketSignalSettings;
  planningComplete: boolean;
  planningFresh: boolean;
};

export function buildAssetSignalAssessment(
  input: BuildAssetSignalAssessmentInput
): AssetSignalAssessment {
  const points = [...input.points].sort((left, right) => left.day.localeCompare(right.day));
  const closes = points.map((point) => point.close);
  const historyAsOf = points.at(-1)?.day ?? null;
  const technicalFresh = input.historyFresh && historyAsOf !== null;
  const insufficient365 = points.length < DRAWDOWN_PERIOD;

  const signals: SignalDatum[] = [
    signal({
      key: 'fear_greed',
      value: input.sentiment?.value ?? null,
      threshold: input.settings.fearGreedMax,
      unit: 'index',
      fresh: input.sentimentFresh,
      asOf: input.sentiment?.observedOn ?? null,
      unavailableReason:
        input.sentiment === null
          ? 'Fear & Greed data has not been refreshed yet.'
          : input.sentimentFreshnessReason
    }),
    signal({
      key: 'rsi_14',
      value: calculateWilderRsi(closes),
      threshold: input.settings.rsi14Max,
      unit: 'index',
      fresh: technicalFresh,
      asOf: historyAsOf,
      unavailableReason:
        points.length < RSI_PERIOD + 1
          ? `At least ${RSI_PERIOD + 1} completed daily closes are required.`
          : input.historyFreshnessReason
    }),
    signal({
      key: 'sma_200_deviation',
      value: calculateSmaDeviation(closes),
      threshold: input.settings.sma200DeviationMax,
      unit: 'percent',
      fresh: technicalFresh,
      asOf: historyAsOf,
      unavailableReason:
        points.length < SMA_PERIOD
          ? `At least ${SMA_PERIOD} completed daily closes are required.`
          : input.historyFreshnessReason
    }),
    signal({
      key: 'drawdown_365',
      value: calculateDrawdown(closes),
      threshold: input.settings.drawdown365Max,
      unit: 'percent',
      fresh: technicalFresh,
      asOf: historyAsOf,
      unavailableReason: insufficient365
        ? `At least ${DRAWDOWN_PERIOD} completed daily closes are required.`
        : input.historyFreshnessReason
    }),
    signal({
      key: 'bollinger_20_z',
      value: calculateBollingerPosition(closes),
      threshold: input.settings.bollingerZMax,
      unit: 'score',
      fresh: technicalFresh,
      asOf: historyAsOf,
      unavailableReason:
        points.length < BOLLINGER_PERIOD
          ? `At least ${BOLLINGER_PERIOD} completed daily closes are required.`
          : input.historyFreshnessReason
    })
  ];

  const drift =
    input.allocation.driftPercentagePoints === null
      ? null
      : decimal(input.allocation.driftPercentagePoints);
  const underweight = input.planningComplete && drift !== null && drift.lt(0);
  const favorableCount = signals.filter((item) => item.favorable).length;
  const allSignalsAvailable = signals.every((item) => item.state !== 'unavailable');
  const candidate =
    input.planningComplete &&
    input.planningFresh &&
    underweight &&
    allSignalsAvailable &&
    favorableCount >= input.settings.requiredFavorableCount;

  const reasons: string[] = [];
  if (!input.planningComplete) reasons.push('Portfolio valuation is partial.');
  if (input.planningComplete && !input.planningFresh) {
    reasons.push('Portfolio valuation uses stale current prices.');
  }
  if (!underweight && input.planningComplete)
    reasons.push('Current allocation is not below its saved target.');
  if (points.length < DRAWDOWN_PERIOD) {
    reasons.push(
      `Only ${points.length} of ${DRAWDOWN_PERIOD} required completed daily closes are available.`
    );
  }
  if (!input.historyFresh && input.historyFreshnessReason)
    reasons.push(input.historyFreshnessReason);
  if (!input.sentimentFresh && input.sentimentFreshnessReason) {
    reasons.push(input.sentimentFreshnessReason);
  }
  if (allSignalsAvailable && favorableCount < input.settings.requiredFavorableCount) {
    reasons.push(
      `${favorableCount} of 5 signals are favorable; ${input.settings.requiredFavorableCount} are required.`
    );
  }

  return {
    assetId: input.allocation.id,
    providerCoinId: input.allocation.providerCoinId,
    symbol: input.allocation.symbol,
    name: input.allocation.name,
    imageUrl: input.allocation.imageUrl,
    baseCurrency: input.baseCurrency,
    targetPercentage: input.allocation.targetPercentage,
    currentAllocationPercentage: input.allocation.currentAllocationPercentage,
    driftPercentagePoints: input.allocation.driftPercentagePoints,
    underweight,
    favorableCount,
    totalSignals: 5,
    allSignalsAvailable,
    candidate,
    candidateLabel: candidate ? 'Contribution candidate' : null,
    signals,
    historyAsOf,
    lastRefreshAt: input.lastRefreshAt,
    reasons: [...new Set(reasons)]
  };
}

export function sortAssetSignalAssessments(
  assessments: AssetSignalAssessment[]
): AssetSignalAssessment[] {
  return [...assessments].sort((left, right) => {
    if (left.candidate !== right.candidate) return left.candidate ? -1 : 1;
    if (left.favorableCount !== right.favorableCount) {
      return right.favorableCount - left.favorableCount;
    }
    const leftDrift = decimal(left.driftPercentagePoints ?? '999999') ?? new Decimal(999999);
    const rightDrift = decimal(right.driftPercentagePoints ?? '999999') ?? new Decimal(999999);
    const driftOrder = leftDrift.comparedTo(rightDrift);
    if (driftOrder !== 0) return driftOrder;
    return left.symbol.localeCompare(right.symbol);
  });
}
