import Decimal from 'decimal.js';
import type {
  AllocationAsset,
  AllocationConcentration,
  AnalyticsChangeMetric,
  AnalyticsRange,
  MonthlyContribution,
  MonthlyPnl
} from '$lib/analytics/types';
import type { TransactionType } from '$lib/types';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

type ValuePoint = {
  value: string | number;
  bucketAt?: string;
};

type MonthlyTransactionInput = {
  type: TransactionType;
  fiatAmount: string;
  feeAmount?: string | null;
  transactionDate: string;
  normalizedFiatAmount?: string;
  normalizedFeeAmount?: string;
};

type MonthlySnapshotInput = {
  bucketAt: string;
  value: string;
};

export type AllocationInput = {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  currentQuantity: string;
  currentValue: string;
  costBasis: string;
  unrealizedProfit: string;
  realizedProfit: string | null;
  totalProfit: string;
  roiPercent: string;
  currentPrice: string;
  priceStatus: AllocationAsset['priceStatus'];
};

function asDecimal(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  return new Decimal(value);
}

function toText(value: Decimal): string {
  if (!value.isFinite()) return '0';
  const cleaned = value.abs().lt('0.000000000001') ? new Decimal(0) : value;
  return cleaned.toDecimalPlaces(12).toString();
}

function monthKey(value: string): string {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const date = new Date(`${key}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(date)
    .replace(' ', ' ');
}

function normalizedFiat(transaction: MonthlyTransactionInput): Decimal {
  return asDecimal(transaction.normalizedFiatAmount ?? transaction.fiatAmount);
}

function normalizedFee(transaction: MonthlyTransactionInput): Decimal {
  return asDecimal(transaction.normalizedFeeAmount ?? transaction.feeAmount);
}

export function calculateRunningAth<T extends ValuePoint>(
  points: T[]
): Array<T & { runningAth: string }> {
  let runningAth = new Decimal(0);

  return points.map((point) => {
    const value = asDecimal(point.value);
    if (value.gt(runningAth)) runningAth = value;
    return {
      ...point,
      runningAth: toText(runningAth)
    };
  });
}

export function calculateDrawdowns<T extends ValuePoint>(
  points: T[]
): Array<T & { runningAth: string; drawdownPercent: string }> {
  return calculateRunningAth(points).map((point) => {
    const value = asDecimal(point.value);
    const runningAth = asDecimal(point.runningAth);
    const drawdown = runningAth.gt(0)
      ? Decimal.min(value.minus(runningAth).div(runningAth).mul(100), 0)
      : new Decimal(0);

    return {
      ...point,
      drawdownPercent: toText(drawdown)
    };
  });
}

export function calculateMaxDrawdown(points: ValuePoint[]): string {
  const drawdowns = calculateDrawdowns(points);
  if (drawdowns.length === 0) return '0';

  return drawdowns
    .reduce((minimum, point) => {
      const value = asDecimal(point.drawdownPercent);
      return value.lt(minimum) ? value : minimum;
    }, new Decimal(0))
    .toDecimalPlaces(12)
    .toString();
}

export function calculatePeriodChange(
  points: ValuePoint[],
  range: AnalyticsRange,
  label: string,
  message?: string
): AnalyticsChangeMetric {
  if (points.length < 2) {
    return {
      range,
      label,
      available: false,
      valueChange: null,
      percentChange: null,
      startValue: points[0] ? toText(asDecimal(points[0].value)) : null,
      endValue: points[0] ? toText(asDecimal(points[0].value)) : null,
      startAt: points[0]?.bucketAt ?? null,
      endAt: points[0]?.bucketAt ?? null,
      message: message ?? `Need at least 2 snapshots for ${label} analytics.`
    };
  }

  const start = points[0];
  const end = points.at(-1) as ValuePoint;
  const startValue = asDecimal(start.value);
  const endValue = asDecimal(end.value);
  const valueChange = endValue.minus(startValue);
  const percentChange = startValue.gt(0) ? valueChange.div(startValue).mul(100) : null;

  return {
    range,
    label,
    available: true,
    valueChange: toText(valueChange),
    percentChange: percentChange ? toText(percentChange) : null,
    startValue: toText(startValue),
    endValue: toText(endValue),
    startAt: start.bucketAt ?? null,
    endAt: end.bucketAt ?? null,
    ...(message ? { message } : {})
  };
}

export function calculateMonthlyContributions(
  transactions: MonthlyTransactionInput[]
): MonthlyContribution[] {
  const grouped = new Map<
    string,
    { monthlyBuyCost: Decimal; monthlySellProceeds: Decimal; netContribution: Decimal }
  >();

  for (const transaction of transactions) {
    const key = monthKey(transaction.transactionDate);
    const existing = grouped.get(key) ?? {
      monthlyBuyCost: new Decimal(0),
      monthlySellProceeds: new Decimal(0),
      netContribution: new Decimal(0)
    };
    const fiat = normalizedFiat(transaction);
    const fee = normalizedFee(transaction);

    if (transaction.type === 'buy') {
      const buyCost = fiat.plus(fee);
      existing.monthlyBuyCost = existing.monthlyBuyCost.plus(buyCost);
      existing.netContribution = existing.netContribution.plus(buyCost);
    } else {
      const sellProceeds = fiat.minus(fee);
      existing.monthlySellProceeds = existing.monthlySellProceeds.plus(sellProceeds);
      existing.netContribution = existing.netContribution.minus(sellProceeds);
    }

    grouped.set(key, existing);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({
      month,
      label: monthLabel(month),
      monthlyBuyCost: toText(value.monthlyBuyCost),
      monthlySellProceeds: toText(value.monthlySellProceeds),
      netContribution: toText(value.netContribution)
    }));
}

export function calculateMonthlyPnl(
  snapshots: MonthlySnapshotInput[],
  contributions: MonthlyContribution[]
): MonthlyPnl[] {
  const contributionsByMonth = new Map(contributions.map((item) => [item.month, item]));
  const snapshotsByMonth = new Map<string, MonthlySnapshotInput[]>();

  for (const snapshot of snapshots) {
    const key = monthKey(snapshot.bucketAt);
    const rows = snapshotsByMonth.get(key) ?? [];
    rows.push(snapshot);
    snapshotsByMonth.set(key, rows);
  }

  const months = new Set([...contributionsByMonth.keys(), ...snapshotsByMonth.keys()]);

  return [...months]
    .sort((a, b) => a.localeCompare(b))
    .map((month) => {
      const rows = (snapshotsByMonth.get(month) ?? []).sort((a, b) =>
        a.bucketAt.localeCompare(b.bucketAt)
      );
      const contribution = contributionsByMonth.get(month);
      const netContribution = asDecimal(contribution?.netContribution);

      if (rows.length < 2) {
        return {
          month,
          label: monthLabel(month),
          startValue: rows[0]?.value ?? null,
          endValue: rows.at(-1)?.value ?? null,
          netContribution: toText(netContribution),
          monthlyPnl: null,
          complete: false,
          message: 'Monthly start/end snapshots are incomplete.'
        };
      }

      const start = rows[0];
      const end = rows.at(-1) as MonthlySnapshotInput;
      const monthlyPnl = asDecimal(end.value).minus(start.value).minus(netContribution);

      return {
        month,
        label: monthLabel(month),
        startValue: start.value,
        endValue: end.value,
        netContribution: toText(netContribution),
        monthlyPnl: toText(monthlyPnl),
        complete: true
      };
    });
}

export function calculateAllocation(
  assets: AllocationInput[],
  baselineAllocationByAsset = new Map<string, string>()
): AllocationAsset[] {
  const totalValue = assets.reduce(
    (total, asset) => total.plus(asset.currentValue),
    new Decimal(0)
  );

  return assets
    .map((asset) => {
      const allocationPercent = totalValue.gt(0)
        ? asDecimal(asset.currentValue).div(totalValue).mul(100)
        : new Decimal(0);
      const baseline = baselineAllocationByAsset.get(asset.assetId) ?? null;
      const drift = baseline ? allocationPercent.minus(baseline) : null;

      return {
        ...asset,
        allocationPercent: toText(allocationPercent),
        baselineAllocationPercent: baseline,
        allocationDriftPercent: drift ? toText(drift) : null
      };
    })
    .sort((a, b) => asDecimal(b.currentValue).cmp(a.currentValue));
}

export function calculateConcentration(
  assets: AllocationAsset[],
  thresholdPercent: string | number
): AllocationConcentration {
  const openAssets = assets.filter((asset) => asDecimal(asset.currentValue).gt(0));
  const largestPosition = openAssets[0] ?? null;
  const smallestPosition = openAssets.at(-1) ?? null;
  const topAssetWeightPercent = largestPosition?.allocationPercent ?? '0';
  const exceedsThreshold = asDecimal(topAssetWeightPercent).gt(thresholdPercent);

  return {
    largestPosition,
    smallestPosition,
    topAssetWeightPercent,
    thresholdPercent: toText(asDecimal(thresholdPercent)),
    status: exceedsThreshold ? 'warning' : 'healthy',
    warning:
      exceedsThreshold && largestPosition
        ? `${largestPosition.assetSymbol} is above the concentration threshold.`
        : null
  };
}
