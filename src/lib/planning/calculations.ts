import Decimal from 'decimal.js';
import { moneyText, percentText } from '$lib/portfolio/decimal';
import type { HoldingSummary, PortfolioOverview } from '$lib/types';
import type {
  ContributionScenario,
  DeadlineStatus,
  LargestDrift,
  PlanningAllocationRow,
  PlanningCompleteness,
  PortfolioPlanning,
  SavedPortfolioPlan
} from './types';

function openHoldings(holdings: HoldingSummary[]): HoldingSummary[] {
  return holdings.filter((holding) => new Decimal(holding.quantity).gt(0));
}

export function calculatePlanningCompleteness(overview: PortfolioOverview): PlanningCompleteness {
  const missingPriceAssets = openHoldings(overview.holdings)
    .filter((holding) => holding.priceStatus === 'missing')
    .map((holding) => holding.assetSymbol);
  const incompleteFxTransactionCount = overview.totals.excludedTransactionCount;
  const recoveryMessages: string[] = [];

  if (missingPriceAssets.length > 0) {
    recoveryMessages.push(
      `Current market price data must recover for ${missingPriceAssets.join(', ')}.`
    );
  }
  if (incompleteFxTransactionCount > 0) {
    recoveryMessages.push(
      `FX conversion data must recover for ${incompleteFxTransactionCount} excluded transaction${incompleteFxTransactionCount === 1 ? '' : 's'}.`
    );
  }

  const complete = missingPriceAssets.length === 0 && incompleteFxTransactionCount === 0;
  return {
    status: complete ? 'complete' : 'partial',
    complete,
    missingPriceCount: missingPriceAssets.length,
    missingPriceAssets,
    incompleteFxTransactionCount,
    recoveryMessages
  };
}

export function calculateDeadlineStatus(
  targetDate: string | null,
  now = new Date()
): DeadlineStatus {
  if (!targetDate) return { state: 'none', targetDate: null, days: null };

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = new Date(`${targetDate}T00:00:00.000Z`).getTime();
  const days = Math.round((target - today) / 86_400_000);
  return {
    state: days < 0 ? 'passed' : days === 0 ? 'today' : 'upcoming',
    targetDate,
    days: Math.abs(days)
  };
}

function calculateAllocationRows(
  plan: SavedPortfolioPlan,
  overview: PortfolioOverview,
  completeness: PlanningCompleteness
): PlanningAllocationRow[] {
  const targetByAsset = new Map(plan.targets.map((target) => [target.id, target]));
  const holdingByAsset = new Map(
    openHoldings(overview.holdings).map((holding) => [holding.assetId, holding])
  );
  const assetIds = new Set([...targetByAsset.keys(), ...holdingByAsset.keys()]);
  const portfolioValue = new Decimal(overview.totals.currentValue);

  return [...assetIds]
    .map((assetId) => {
      const target = targetByAsset.get(assetId);
      const holding = holdingByAsset.get(assetId);
      const held = Boolean(holding);
      const targeted = Boolean(target);
      const targetPercentage = target?.targetPercentage ?? '0';
      const missingPrice = holding?.priceStatus === 'missing';
      const currentValue =
        completeness.incompleteFxTransactionCount > 0 || missingPrice
          ? null
          : (holding?.currentValue ?? '0');
      let currentAllocationPercentage: string | null = null;
      let driftPercentagePoints: string | null = null;
      let fiatValueGap: string | null = null;

      if (completeness.complete && currentValue !== null) {
        const current = new Decimal(currentValue);
        const currentPercentage = portfolioValue.gt(0)
          ? current.div(portfolioValue).mul(100)
          : new Decimal(0);
        const targetDecimal = new Decimal(targetPercentage);
        currentAllocationPercentage = percentText(currentPercentage);
        driftPercentagePoints = percentText(currentPercentage.minus(targetDecimal));
        fiatValueGap = moneyText(targetDecimal.div(100).mul(portfolioValue).minus(current));
      }

      return {
        id: target?.id ?? holding?.assetId ?? assetId,
        provider: target?.provider ?? assetId.split(':', 1)[0] ?? '',
        providerCoinId: target?.providerCoinId ?? assetId.split(':').slice(1).join(':'),
        symbol: target?.symbol ?? holding?.assetSymbol ?? assetId,
        name: target?.name ?? holding?.assetName ?? assetId,
        imageUrl: target?.imageUrl ?? holding?.imageUrl ?? null,
        currentValue,
        currentAllocationPercentage,
        targetPercentage,
        driftPercentagePoints,
        fiatValueGap,
        held,
        targeted,
        priceStatus: holding?.priceStatus ?? 'not_required'
      } satisfies PlanningAllocationRow;
    })
    .sort((left, right) => {
      if (left.targeted !== right.targeted) return left.targeted ? -1 : 1;
      const targetOrder = new Decimal(right.targetPercentage).cmp(left.targetPercentage);
      return targetOrder || left.symbol.localeCompare(right.symbol);
    });
}

function findLargestDrift(rows: PlanningAllocationRow[]): LargestDrift {
  const available = rows.filter(
    (row): row is PlanningAllocationRow & { driftPercentagePoints: string } =>
      row.driftPercentagePoints !== null
  );
  if (available.length === 0) return null;

  const largest = available.reduce((current, row) =>
    new Decimal(row.driftPercentagePoints)
      .abs()
      .gt(new Decimal(current.driftPercentagePoints).abs())
      ? row
      : current
  );
  return {
    assetId: largest.id,
    symbol: largest.symbol,
    driftPercentagePoints: largest.driftPercentagePoints,
    absoluteDriftPercentagePoints: percentText(new Decimal(largest.driftPercentagePoints).abs())
  };
}

export function buildPortfolioPlanning(
  plan: SavedPortfolioPlan | null,
  overview: PortfolioOverview,
  hasTransactions: boolean,
  now = new Date()
): PortfolioPlanning {
  const completeness = calculatePlanningCompleteness(overview);
  if (!plan) {
    return {
      plan: null,
      hasTransactions,
      completeness,
      goal: null,
      deadline: calculateDeadlineStatus(null, now),
      allocationRows: [],
      largestDrift: null
    };
  }

  const targetValue = new Decimal(plan.targetValue);
  const currentValue = completeness.complete ? new Decimal(overview.totals.currentValue) : null;
  const allocationRows = calculateAllocationRows(plan, overview, completeness);

  return {
    plan,
    hasTransactions,
    completeness,
    goal: {
      currentValue: currentValue ? moneyText(currentValue) : null,
      targetValue: moneyText(targetValue),
      remainingValue: currentValue
        ? moneyText(Decimal.max(targetValue.minus(currentValue), new Decimal(0)))
        : null,
      progressPercentage: currentValue ? percentText(currentValue.div(targetValue).mul(100)) : null
    },
    deadline: calculateDeadlineStatus(plan.targetDate, now),
    allocationRows,
    largestDrift: findLargestDrift(allocationRows)
  };
}

export function calculateContributionScenario(
  planning: PortfolioPlanning,
  contributionInput: string
): ContributionScenario {
  if (!planning.plan || !planning.goal) throw new Error('Create a portfolio plan first.');
  if (!planning.completeness.complete || planning.goal.currentValue === null) {
    throw new Error(
      `This scenario is unavailable while portfolio totals are partial. ${planning.completeness.recoveryMessages.join(' ')}`.trim()
    );
  }

  const contribution = new Decimal(moneyText(new Decimal(contributionInput)));
  if (!contribution.isFinite() || !contribution.gt(0)) {
    throw new Error('Contribution amount must be greater than zero.');
  }

  const currentPortfolioValue = new Decimal(planning.goal.currentValue);
  const projectedPortfolioValue = currentPortfolioValue.plus(contribution);
  const targetedRows = planning.allocationRows.filter((row) => row.targeted);
  const deficits = targetedRows.map((row) => {
    const currentValue = new Decimal(row.currentValue ?? 0);
    const desiredValue = new Decimal(row.targetPercentage).div(100).mul(projectedPortfolioValue);
    return Decimal.max(desiredValue.minus(currentValue), new Decimal(0));
  });
  const totalDeficit = deficits.reduce((sum, deficit) => sum.plus(deficit), new Decimal(0));
  if (!totalDeficit.gt(0)) throw new Error('No positive target deficits are available.');

  const positiveIndexes = deficits
    .map((deficit, index) => (deficit.gt(0) ? index : -1))
    .filter((index) => index >= 0);
  const lastPositiveIndex = positiveIndexes.at(-1);
  let distributed = new Decimal(0);

  const rows = targetedRows.map((row, index) => {
    const currentValue = new Decimal(row.currentValue ?? 0);
    let hypotheticalAmount = new Decimal(0);
    if (deficits[index].gt(0)) {
      hypotheticalAmount =
        index === lastPositiveIndex
          ? contribution.minus(distributed)
          : new Decimal(moneyText(contribution.mul(deficits[index]).div(totalDeficit)));
      distributed = distributed.plus(hypotheticalAmount);
    }
    const projectedAllocation = currentValue
      .plus(hypotheticalAmount)
      .div(projectedPortfolioValue)
      .mul(100);

    return {
      assetId: row.id,
      symbol: row.symbol,
      name: row.name,
      imageUrl: row.imageUrl,
      targetPercentage: row.targetPercentage,
      hypotheticalAmount: moneyText(hypotheticalAmount),
      projectedAllocationPercentage: percentText(projectedAllocation),
      remainingDriftPercentagePoints: percentText(projectedAllocation.minus(row.targetPercentage))
    };
  });

  return {
    contribution: moneyText(contribution),
    projectedPortfolioValue: moneyText(projectedPortfolioValue),
    distributedTotal: moneyText(distributed),
    rows
  };
}

export function convertTargetValue(targetValue: string, rate: string): string {
  const value = new Decimal(targetValue);
  const fxRate = new Decimal(rate);
  if (!value.isFinite() || !value.gt(0) || !fxRate.isFinite() || !fxRate.gt(0)) {
    throw new Error('Plan target and FX rate must be positive decimal values.');
  }
  return moneyText(value.mul(fxRate));
}
