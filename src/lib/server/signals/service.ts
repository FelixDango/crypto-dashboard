import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { PortfolioPlanning } from '$lib/planning/types';
import type {
  DailyMarketPoint,
  MarketSignalHealth,
  PlannedAssetMarketSignals
} from '$lib/market-signals/types';
import {
  buildAssetSignalAssessment,
  sortAssetSignalAssessments
} from '$lib/market-signals/calculations';
import { db } from '$lib/server/db/client';
import { marketDailyPoints, marketSignalRefreshState } from '$lib/server/db/schema';
import { getMarketSignalSettings } from './settings';
import { getAppSettings } from '$lib/server/settings';
import { getLatestMarketSentiment, historyIsFresh, sentimentIsFresh } from './refresh';

function sourceDayReason(
  day: string | null,
  fresh: boolean,
  refreshError: string | null
): string | null {
  if (!day) return 'Market history has not been refreshed for this base currency.';
  if (refreshError) return `Latest market-history refresh failed: ${refreshError}`;
  return fresh ? null : 'Completed daily market history is over 36 hours stale.';
}

function sentimentReason(hasSentiment: boolean, fresh: boolean): string | null {
  if (!hasSentiment) return 'Fear & Greed data has not been refreshed yet.';
  return fresh ? null : 'Fear & Greed data is over 48 hours stale.';
}

export function getPlannedAssetMarketSignals(
  planning: PortfolioPlanning,
  now = new Date()
): PlannedAssetMarketSignals {
  const settings = getMarketSignalSettings();
  const sentiment = getLatestMarketSentiment();
  const sentimentFresh = sentimentIsFresh(sentiment, now);
  const baseCurrency = planning.plan?.currency ?? getAppSettings().baseCurrency;
  const allocations = planning.allocationRows.filter((row) => row.targeted);
  const portfolioFresh = !planning.allocationRows.some(
    (row) => row.held && row.priceStatus === 'stale'
  );
  const assetIds = allocations.map((row) => row.id);
  const points = assetIds.length
    ? db
        .select()
        .from(marketDailyPoints)
        .where(
          and(
            eq(marketDailyPoints.baseCurrency, baseCurrency),
            inArray(marketDailyPoints.assetId, assetIds)
          )
        )
        .orderBy(asc(marketDailyPoints.day))
        .all()
    : [];
  const states = assetIds.length
    ? db
        .select()
        .from(marketSignalRefreshState)
        .where(
          and(
            eq(marketSignalRefreshState.baseCurrency, baseCurrency),
            inArray(marketSignalRefreshState.assetId, assetIds)
          )
        )
        .orderBy(desc(marketSignalRefreshState.lastSuccessAt))
        .all()
    : [];
  const pointsByAsset = new Map<string, DailyMarketPoint[]>();
  for (const point of points) {
    const list = pointsByAsset.get(point.assetId) ?? [];
    list.push(point);
    pointsByAsset.set(point.assetId, list);
  }
  const stateByAsset = new Map(states.map((state) => [state.assetId, state]));

  const assessments = sortAssetSignalAssessments(
    allocations.map((allocation) => {
      const assetPoints = (pointsByAsset.get(allocation.id) ?? []).filter(
        (point) => point.source === allocation.provider
      );
      const state = stateByAsset.get(allocation.id);
      const latestDay = assetPoints.at(-1)?.day ?? null;
      const fresh =
        !state?.lastError && historyIsFresh(latestDay, state?.lastSuccessAt ?? null, now);
      return buildAssetSignalAssessment({
        allocation,
        baseCurrency,
        points: assetPoints,
        historyFresh: fresh,
        historyFreshnessReason: sourceDayReason(latestDay, fresh, state?.lastError ?? null),
        lastRefreshAt: state?.lastSuccessAt ?? null,
        sentiment,
        sentimentFresh,
        sentimentFreshnessReason: sentimentReason(sentiment !== null, sentimentFresh),
        settings,
        planningComplete: planning.completeness.complete,
        planningFresh: portfolioFresh
      });
    })
  );

  const health: MarketSignalHealth = {
    status:
      assessments.length === 0
        ? 'empty'
        : assessments.every((assessment) => assessment.allSignalsAvailable)
          ? 'complete'
          : 'partial',
    plannedAssetCount: assessments.length,
    fullyScoredAssetCount: assessments.filter((assessment) => assessment.allSignalsAvailable)
      .length,
    candidateCount: assessments.filter((assessment) => assessment.candidate).length,
    staleAssetCount: assessments.filter((assessment) => {
      const state = stateByAsset.get(assessment.assetId);
      return Boolean(state?.lastSuccessAt) && !assessment.allSignalsAvailable;
    }).length,
    pendingAssetCount: assessments.filter(
      (assessment) => !stateByAsset.get(assessment.assetId)?.lastSuccessAt
    ).length,
    lastHistoryRefreshAt: states.find((state) => state.lastSuccessAt)?.lastSuccessAt ?? null,
    sentimentFresh,
    messages: []
  };
  if (health.pendingAssetCount > 0) {
    health.messages.push(`${health.pendingAssetCount} planned asset(s) are waiting for history.`);
  }
  if (health.staleAssetCount > 0) {
    health.messages.push(
      `${health.staleAssetCount} planned asset(s) have stale or incomplete signals.`
    );
  }
  if (!health.sentimentFresh)
    health.messages.push('Global Fear & Greed context is unavailable or stale.');

  return {
    baseCurrency,
    settings,
    sentiment,
    assessments,
    health,
    methodologyDisclaimer:
      'These deterministic signals provide market context only. They do not establish fair value, predict returns, or recommend a transaction.'
  };
}
