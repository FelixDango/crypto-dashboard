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
import { moneyText } from '$lib/portfolio/decimal';

Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

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
  capturedAt?: string;
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
  return moneyText(value);
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

function monthStart(key: string): number {
  return new Date(`${key}-01T00:00:00.000Z`).getTime();
}

function nextMonthStart(key: string): number {
  const date = new Date(`${key}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.getTime();
}

function snapshotTime(snapshot: MonthlySnapshotInput): number {
  return new Date(snapshot.capturedAt ?? snapshot.bucketAt).getTime();
}

function normalizedFiat(transaction: MonthlyTransactionInput): Decimal {
  return asDecimal(transaction.normalizedFiatAmount ?? transaction.fiatAmount);
}

function normalizedFee(transaction: MonthlyTransactionInput): Decimal {
  return asDecimal(transaction.normalizedFeeAmount ?? transaction.feeAmount);
}

function transactionNetContribution(transaction: MonthlyTransactionInput): Decimal {
  const fiat = normalizedFiat(transaction);
  const fee = normalizedFee(transaction);
  return transaction.type === 'buy' ? fiat.plus(fee) : fiat.minus(fee).negated();
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

  return toText(
    drawdowns.reduce((minimum, point) => {
      const value = asDecimal(point.drawdownPercent);
      return value.lt(minimum) ? value : minimum;
    }, new Decimal(0))
  );
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
  transactions: MonthlyTransactionInput[]
): MonthlyPnl[] {
  const orderedSnapshots = [...snapshots].sort(
    (left, right) => snapshotTime(left) - snapshotTime(right)
  );
  const months = new Set([
    ...transactions.map((transaction) => monthKey(transaction.transactionDate)),
    ...orderedSnapshots.map((snapshot) => monthKey(snapshot.bucketAt))
  ]);

  return [...months]
    .sort((a, b) => a.localeCompare(b))
    .map((month) => {
      const startAt = monthStart(month);
      const nextAt = nextMonthStart(month);
      const rows = orderedSnapshots.filter((snapshot) => {
        const bucketAt = new Date(snapshot.bucketAt).getTime();
        return bucketAt >= startAt && bucketAt < nextAt;
      });
      const end = rows.at(-1);
      const boundaryBaseline = orderedSnapshots
        .filter((snapshot) => new Date(snapshot.bucketAt).getTime() <= startAt)
        .at(-1);
      const baseline = boundaryBaseline ?? (rows.length >= 2 ? rows[0] : undefined);

      if (!baseline || !end || baseline === end) {
        return {
          month,
          label: monthLabel(month),
          startValue: baseline?.value ?? null,
          endValue: end?.value ?? null,
          netContribution: '0',
          monthlyPnl: null,
          complete: false,
          message: 'A usable month-boundary baseline and end snapshot are required.'
        };
      }

      const baselineAt = snapshotTime(baseline);
      const endAt = snapshotTime(end);
      const netContribution = transactions.reduce((sum, transaction) => {
        const transactionAt = new Date(transaction.transactionDate).getTime();
        return transactionAt > baselineAt && transactionAt <= endAt
          ? sum.plus(transactionNetContribution(transaction))
          : sum;
      }, new Decimal(0));
      const monthlyPnl = asDecimal(end.value).minus(baseline.value).minus(netContribution);

      return {
        month,
        label: monthLabel(month),
        startValue: baseline.value,
        endValue: end.value,
        netContribution: toText(netContribution),
        monthlyPnl: toText(monthlyPnl),
        complete: true
      };
    });
}

export function calculateTimeWeightedReturn(
  snapshots: MonthlySnapshotInput[],
  transactions: MonthlyTransactionInput[]
): string | null {
  const ordered = [...snapshots].sort((left, right) => snapshotTime(left) - snapshotTime(right));
  if (ordered.length < 2) return null;

  let growth = new Decimal(1);
  for (let index = 1; index < ordered.length; index += 1) {
    const start = ordered[index - 1];
    const end = ordered[index];
    const startValue = asDecimal(start.value);
    if (startValue.lte(0)) return null;

    const startAt = snapshotTime(start);
    const endAt = snapshotTime(end);
    const netFlow = transactions.reduce((sum, transaction) => {
      const transactionAt = new Date(transaction.transactionDate).getTime();
      return transactionAt > startAt && transactionAt <= endAt
        ? sum.plus(transactionNetContribution(transaction))
        : sum;
    }, new Decimal(0));
    const periodGrowth = asDecimal(end.value).minus(netFlow).div(startValue);
    if (periodGrowth.lte(0)) return null;
    growth = growth.mul(periodGrowth);
  }

  return toText(growth.minus(1).mul(100));
}

type DatedCashFlow = { at: string; amount: Decimal };

function xnpv(rate: Decimal, cashFlows: DatedCashFlow[]): Decimal {
  const firstAt = new Date(cashFlows[0].at).getTime();
  const yearMs = new Decimal(365.2425).mul(24).mul(60).mul(60).mul(1000);
  return cashFlows.reduce((sum, cashFlow) => {
    const years = new Decimal(new Date(cashFlow.at).getTime() - firstAt).div(yearMs);
    return sum.plus(cashFlow.amount.div(rate.plus(1).pow(years)));
  }, new Decimal(0));
}

export function calculateMoneyWeightedReturn(
  transactions: MonthlyTransactionInput[],
  terminalValue: string,
  valuationAt: string
): string | null {
  const cashFlows: DatedCashFlow[] = transactions.map((transaction) => ({
    at: transaction.transactionDate,
    amount: transactionNetContribution(transaction).negated()
  }));
  cashFlows.push({ at: valuationAt, amount: asDecimal(terminalValue) });
  cashFlows.sort((left, right) => left.at.localeCompare(right.at));

  if (
    cashFlows.length < 2 ||
    !cashFlows.some((cashFlow) => cashFlow.amount.lt(0)) ||
    !cashFlows.some((cashFlow) => cashFlow.amount.gt(0))
  ) {
    return null;
  }

  let lower = new Decimal('-0.999999');
  let upper = new Decimal(1);
  let lowerValue = xnpv(lower, cashFlows);
  let upperValue = xnpv(upper, cashFlows);
  for (let index = 0; index < 32 && lowerValue.mul(upperValue).gt(0); index += 1) {
    upper = upper.mul(2).plus(1);
    upperValue = xnpv(upper, cashFlows);
  }
  if (lowerValue.mul(upperValue).gt(0)) return null;

  for (let index = 0; index < 160; index += 1) {
    const midpoint = lower.plus(upper).div(2);
    const midpointValue = xnpv(midpoint, cashFlows);
    if (midpointValue.abs().lt('0.000000000000000001')) {
      return toText(midpoint.mul(100));
    }
    if (lowerValue.mul(midpointValue).lte(0)) {
      upper = midpoint;
    } else {
      lower = midpoint;
      lowerValue = midpointValue;
    }
  }

  return toText(lower.plus(upper).div(2).mul(100));
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
      const baseline =
        baselineAllocationByAsset.size === 0
          ? null
          : (baselineAllocationByAsset.get(asset.assetId) ?? '0');
      const drift = baseline === null ? null : allocationPercent.minus(baseline);

      return {
        ...asset,
        allocationPercent: toText(allocationPercent),
        baselineAllocationPercent: baseline,
        allocationDriftPercent: drift === null ? null : toText(drift)
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
