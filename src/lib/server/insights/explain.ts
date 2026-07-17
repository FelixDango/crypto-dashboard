import Decimal from 'decimal.js';
import type { AnalyticsRange } from '$lib/analytics/types';
import { formatCurrency, formatPercent } from '$lib/format';
import {
  getAnalyticsAllocation,
  getAnalyticsSnapshotSeries,
  getAnalyticsSummary
} from '$lib/server/analytics/service';
import { getDataConfidence } from '$lib/server/insights/data-confidence';
import { getCycleProgress } from '$lib/server/insights/market-cycle';
import { getAppSettings } from '$lib/server/settings';
import { listTransactionsWithAssets } from '$lib/server/transactions';
import { normalizeTransactions } from '$lib/server/fx/cache';
import { moneyText } from '$lib/portfolio/decimal';

export type ExplainRange = Extract<AnalyticsRange, '24h' | '7d' | '30d'>;

export type ExplainDriverReason = 'price_movement' | 'transaction' | 'allocation' | 'data_issue';

export type ExplainDriver = {
  asset: string;
  contribution: string;
  reason: ExplainDriverReason;
};

export type ExplainResult = {
  summary: string;
  bullets: string[];
  warnings: string[];
  drivers: ExplainDriver[];
};

type ExplainOptions = {
  now?: Date;
};

function asDecimal(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  return new Decimal(value);
}

function rangeStart(range: ExplainRange, now: Date): Date {
  const start = new Date(now);
  if (range === '24h') start.setUTCHours(start.getUTCHours() - 24);
  if (range === '7d') start.setUTCDate(start.getUTCDate() - 7);
  if (range === '30d') start.setUTCDate(start.getUTCDate() - 30);
  return start;
}

function direction(value: Decimal): string {
  if (value.gt(0)) return 'up';
  if (value.lt(0)) return 'down';
  return 'flat';
}

function sentenceCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function topWarnings(warnings: string[]): string[] {
  return warnings.slice(0, 5);
}

async function transactionDrivers(range: ExplainRange, now: Date): Promise<ExplainDriver[]> {
  const start = rangeStart(range, now).toISOString();
  const settings = getAppSettings();
  const normalized = await normalizeTransactions(
    listTransactionsWithAssets(),
    settings.baseCurrency
  );

  return normalized
    .filter((transaction) => transaction.fxComplete && transaction.transactionDate >= start)
    .map((transaction) => {
      const gross = asDecimal(transaction.normalizedFiatAmount);
      const fee = asDecimal(transaction.normalizedFeeAmount);
      const amount = transaction.type === 'buy' ? gross.plus(fee) : gross.minus(fee).negated();
      return {
        asset: transaction.assetSymbol,
        contribution: moneyText(amount),
        reason: 'transaction' as const
      };
    });
}

export async function explainAssetDrivers(
  range: ExplainRange,
  options: ExplainOptions = {}
): Promise<ExplainResult> {
  const now = options.now ?? new Date();
  const allocation = await getAnalyticsAllocation();
  const transactions = await transactionDrivers(range, now);
  const allocationDrivers = allocation.assets.map((asset) => ({
    asset: asset.assetSymbol,
    contribution: asset.totalProfit,
    reason: asset.priceStatus === 'fresh' ? ('price_movement' as const) : ('data_issue' as const)
  }));
  const drivers = [...allocationDrivers, ...transactions].sort((a, b) =>
    asDecimal(b.contribution).abs().cmp(asDecimal(a.contribution).abs())
  );
  const top = drivers[0];

  return {
    summary: top
      ? `${top.asset} is the largest deterministic driver currently visible.`
      : 'No asset drivers are available yet.',
    bullets: drivers.slice(0, 4).map((driver) => {
      if (driver.reason === 'transaction') {
        return `${driver.asset} has a manual transaction inside the ${range} window.`;
      }
      if (driver.reason === 'data_issue') {
        return `${driver.asset} driver is limited by stale or missing price data.`;
      }
      return `${driver.asset} is contributing through current price movement and allocation.`;
    }),
    warnings: [],
    drivers
  };
}

export async function explainCycleContext(options: ExplainOptions = {}): Promise<ExplainResult> {
  const progress = getCycleProgress(options.now ?? new Date());

  if (!progress) {
    return {
      summary: 'The current date is outside the configured custom cycle model.',
      bullets: ['Custom cycle model is personal context, not predictive certainty.'],
      warnings: [],
      drivers: []
    };
  }

  const phase = sentenceCase(progress.phase);
  return {
    summary: `Current custom cycle phase: ${phase}, ending ${progress.visibleEndDate}.`,
    bullets: [
      `${phase} phase started ${progress.phaseStart}.`,
      `Next transition: ${progress.nextTransition.label} ${progress.nextTransition.date}.`,
      `${progress.daysRemaining} days remain in this half-open phase window.`
    ],
    warnings: ['This is a personal custom cycle model, not a prediction or financial advice.'],
    drivers: []
  };
}

export async function explainDataHealth(options: ExplainOptions = {}): Promise<ExplainResult> {
  const confidence = await getDataConfidence({ now: options.now });

  return {
    summary: `Data confidence is ${confidence.score}%.`,
    bullets: Object.entries(confidence.categories).map(
      ([name, item]) => `${sentenceCase(name)}: ${item.score}% (${item.status}).`
    ),
    warnings: topWarnings(confidence.issues),
    drivers: confidence.issues.map((issue) => ({
      asset: 'Data',
      contribution: '0',
      reason: 'data_issue' as const,
      issue
    })) as ExplainDriver[]
  };
}

export async function explainRiskState(options: ExplainOptions = {}): Promise<ExplainResult> {
  const summary = await getAnalyticsSummary({ now: options.now });
  const allocation = await getAnalyticsAllocation();
  const bullets: string[] = [];
  const warnings: string[] = [];

  if (summary.currentDrawdownPercent !== null) {
    bullets.push(`Current drawdown from ATH is ${formatPercent(summary.currentDrawdownPercent)}.`);
  }

  if (summary.maxDrawdownPercent !== null) {
    bullets.push(`Max observed drawdown is ${formatPercent(summary.maxDrawdownPercent)}.`);
  }

  if (allocation.concentration.largestPosition) {
    bullets.push(
      `${allocation.concentration.largestPosition.assetSymbol} is the largest position at ${formatPercent(
        allocation.concentration.topAssetWeightPercent
      )}.`
    );
  }

  if (allocation.concentration.warning) warnings.push(allocation.concentration.warning);

  return {
    summary: warnings.length > 0 ? 'Risk notes need attention.' : 'No major risk notes detected.',
    bullets,
    warnings,
    drivers: allocation.assets.slice(0, 3).map((asset) => ({
      asset: asset.assetSymbol,
      contribution: asset.allocationPercent,
      reason: 'allocation' as const
    }))
  };
}

export async function explainPortfolioMove(
  range: ExplainRange,
  options: ExplainOptions = {}
): Promise<ExplainResult> {
  const now = options.now ?? new Date();
  const settings = getAppSettings();
  const summary = await getAnalyticsSummary({ now });
  const series = getAnalyticsSnapshotSeries(range, { now });
  const metric = summary.changes[range];
  const dataHealth = await explainDataHealth({ now });
  const cycle = await explainCycleContext({ now });
  const assetDrivers = await explainAssetDrivers(range, { now });
  const transactionCount = (await transactionDrivers(range, now)).length;

  if (!metric.available) {
    return {
      summary: metric.message ?? `Not enough ${range} history to explain portfolio movement.`,
      bullets: [
        `${series.points.length} snapshot point${series.points.length === 1 ? '' : 's'} found for ${range}.`,
        cycle.summary
      ],
      warnings: dataHealth.warnings,
      drivers: assetDrivers.drivers
    };
  }

  const valueChange = asDecimal(metric.valueChange);
  const percentChange = metric.percentChange ? formatPercent(metric.percentChange) : '0.00%';
  const movement = direction(valueChange);
  const bullets = [
    `${sentenceCase(movement)} ${percentChange} over ${range}.`,
    transactionCount === 0
      ? `No manual transactions were added inside the ${range} window.`
      : `${transactionCount} manual transaction${transactionCount === 1 ? '' : 's'} found inside the ${range} window.`,
    cycle.summary
  ];

  if (summary.currentDrawdownPercent !== null) {
    bullets.push(`Portfolio remains ${formatPercent(summary.currentDrawdownPercent)} from ATH.`);
  }

  return {
    summary: `Your portfolio is ${movement} ${formatCurrency(
      valueChange.abs().toString(),
      settings.baseCurrency
    )} over ${range}.`,
    bullets,
    warnings: dataHealth.warnings,
    drivers: assetDrivers.drivers
  };
}
