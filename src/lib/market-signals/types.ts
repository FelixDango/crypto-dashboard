import type { Currency } from '$lib/types';

export type MarketSignalKey =
  'fear_greed' | 'rsi_14' | 'sma_200_deviation' | 'drawdown_365' | 'bollinger_20_z';

export type MarketSignalState = 'favorable' | 'neutral' | 'unavailable';

export type MarketSignalSettings = {
  id: 1;
  fearGreedMax: string;
  rsi14Max: string;
  sma200DeviationMax: string;
  drawdown365Max: string;
  bollingerZMax: string;
  requiredFavorableCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DailyMarketPoint = {
  assetId: string;
  baseCurrency: Currency;
  day: string;
  close: string;
  volume: string | null;
  source: string;
  capturedAt: string;
};

export type MarketSentiment = {
  provider: 'alternative.me';
  observedOn: string;
  value: string;
  classification: string;
  sourceUrl: string;
  capturedAt: string;
};

export type SignalDatum = {
  key: MarketSignalKey;
  label: string;
  value: string | null;
  threshold: string;
  unit: 'index' | 'percent' | 'score';
  state: MarketSignalState;
  favorable: boolean;
  fresh: boolean;
  asOf: string | null;
  explanation: string;
  unavailableReason: string | null;
};

export type AssetSignalAssessment = {
  assetId: string;
  providerCoinId: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  baseCurrency: Currency;
  targetPercentage: string;
  currentAllocationPercentage: string | null;
  driftPercentagePoints: string | null;
  underweight: boolean;
  favorableCount: number;
  totalSignals: 5;
  allSignalsAvailable: boolean;
  candidate: boolean;
  candidateLabel: 'Contribution candidate' | null;
  signals: SignalDatum[];
  historyAsOf: string | null;
  lastRefreshAt: string | null;
  reasons: string[];
};

export type MarketSignalHealth = {
  status: 'complete' | 'partial' | 'empty';
  plannedAssetCount: number;
  fullyScoredAssetCount: number;
  candidateCount: number;
  staleAssetCount: number;
  pendingAssetCount: number;
  lastHistoryRefreshAt: string | null;
  sentimentFresh: boolean;
  messages: string[];
};

export type PlannedAssetMarketSignals = {
  baseCurrency: Currency;
  settings: MarketSignalSettings;
  sentiment: MarketSentiment | null;
  assessments: AssetSignalAssessment[];
  health: MarketSignalHealth;
  methodologyDisclaimer: string;
};
