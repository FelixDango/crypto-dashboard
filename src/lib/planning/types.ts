import type { Currency } from '$lib/types';

export type PlanningAsset = {
  id: string;
  provider: string;
  providerCoinId: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
};

export type PortfolioAllocationTargetInput = {
  asset: Omit<PlanningAsset, 'id'>;
  targetPercentage: string;
};

export type PortfolioPlanInput = {
  name: string;
  targetValue: string;
  currency: Currency;
  targetDate: string | null;
  targets: PortfolioAllocationTargetInput[];
};

export type SavedAllocationTarget = PlanningAsset & {
  targetPercentage: string;
};

export type SavedPortfolioPlan = {
  id: 1;
  name: string;
  targetValue: string;
  currency: Currency;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
  targets: SavedAllocationTarget[];
};

export type PlanningCompleteness = {
  status: 'complete' | 'partial';
  complete: boolean;
  missingPriceCount: number;
  missingPriceAssets: string[];
  incompleteFxTransactionCount: number;
  recoveryMessages: string[];
};

export type GoalProgress = {
  currentValue: string | null;
  targetValue: string;
  remainingValue: string | null;
  progressPercentage: string | null;
};

export type DeadlineStatus = {
  state: 'none' | 'upcoming' | 'today' | 'passed';
  targetDate: string | null;
  days: number | null;
};

export type PlanningAllocationRow = PlanningAsset & {
  currentValue: string | null;
  currentAllocationPercentage: string | null;
  targetPercentage: string;
  driftPercentagePoints: string | null;
  fiatValueGap: string | null;
  held: boolean;
  targeted: boolean;
  priceStatus: 'fresh' | 'stale' | 'missing' | 'not_required';
};

export type LargestDrift = {
  assetId: string;
  symbol: string;
  driftPercentagePoints: string;
  absoluteDriftPercentagePoints: string;
} | null;

export type PortfolioPlanning = {
  plan: SavedPortfolioPlan | null;
  hasTransactions: boolean;
  completeness: PlanningCompleteness;
  goal: GoalProgress | null;
  deadline: DeadlineStatus;
  allocationRows: PlanningAllocationRow[];
  largestDrift: LargestDrift;
};

export type ContributionScenarioRow = {
  assetId: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  targetPercentage: string;
  hypotheticalAmount: string;
  projectedAllocationPercentage: string;
  remainingDriftPercentagePoints: string;
};

export type ContributionScenario = {
  contribution: string;
  projectedPortfolioValue: string;
  distributedTotal: string;
  rows: ContributionScenarioRow[];
};

export type PortfolioPlanDraft = {
  name: string;
  targetValue: string;
  targetDate: string;
  targets: Array<{
    provider: string;
    providerCoinId: string;
    symbol: string;
    name: string;
    imageUrl: string | null;
    targetPercentage: string;
  }>;
};
