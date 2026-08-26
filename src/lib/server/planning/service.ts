import { asc, eq } from 'drizzle-orm';
import type { Currency, PortfolioOverview } from '$lib/types';
import type {
  PortfolioPlanInput,
  PortfolioPlanning,
  SavedPortfolioPlan
} from '$lib/planning/types';
import { buildPortfolioPlanning, convertTargetValue } from '$lib/planning/calculations';
import { portfolioPlanSchema } from '$lib/validation/planning';
import { upsertAsset } from '$lib/server/assets';
import { db, getSqlite } from '$lib/server/db/client';
import { assets, portfolioAllocationTargets, portfolioPlans } from '$lib/server/db/schema';
import { getFxRateForDate } from '$lib/server/fx/cache';
import { getPortfolioOverview, getTransactionCount } from '$lib/server/portfolio/service';

const ACTIVE_PLAN_ID = 1 as const;

export function getSavedPortfolioPlan(): SavedPortfolioPlan | null {
  const plan = db.select().from(portfolioPlans).where(eq(portfolioPlans.id, ACTIVE_PLAN_ID)).get();
  if (!plan) return null;

  const targetRows = db
    .select({
      assetId: assets.id,
      provider: assets.provider,
      providerCoinId: assets.providerCoinId,
      symbol: assets.symbol,
      name: assets.name,
      imageUrl: assets.imageUrl,
      targetPercentage: portfolioAllocationTargets.targetPercentage
    })
    .from(portfolioAllocationTargets)
    .innerJoin(assets, eq(portfolioAllocationTargets.assetId, assets.id))
    .where(eq(portfolioAllocationTargets.planId, ACTIVE_PLAN_ID))
    .orderBy(asc(assets.symbol))
    .all();

  return {
    id: ACTIVE_PLAN_ID,
    name: plan.name,
    targetValue: plan.targetValue,
    currency: plan.currency,
    targetDate: plan.targetDate,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    targets: targetRows.map((target) => ({
      id: target.assetId,
      provider: target.provider,
      providerCoinId: target.providerCoinId,
      symbol: target.symbol,
      name: target.name,
      imageUrl: target.imageUrl,
      targetPercentage: target.targetPercentage
    }))
  };
}

export function savePortfolioPlan(input: PortfolioPlanInput): SavedPortfolioPlan {
  const parsed = portfolioPlanSchema.parse(input);
  const now = new Date().toISOString();
  const existing = getSavedPortfolioPlan();

  getSqlite().transaction(() => {
    const selectedAssets = parsed.targets.map((target) => upsertAsset(target.asset));
    db.insert(portfolioPlans)
      .values({
        id: ACTIVE_PLAN_ID,
        name: parsed.name,
        targetValue: parsed.targetValue,
        currency: parsed.currency,
        targetDate: parsed.targetDate,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: portfolioPlans.id,
        set: {
          name: parsed.name,
          targetValue: parsed.targetValue,
          currency: parsed.currency,
          targetDate: parsed.targetDate,
          updatedAt: now
        }
      })
      .run();

    db.delete(portfolioAllocationTargets)
      .where(eq(portfolioAllocationTargets.planId, ACTIVE_PLAN_ID))
      .run();
    if (selectedAssets.length > 0) {
      db.insert(portfolioAllocationTargets)
        .values(
          selectedAssets.map((asset, index) => ({
            id: `${ACTIVE_PLAN_ID}:${asset.id}`,
            planId: ACTIVE_PLAN_ID,
            assetId: asset.id,
            targetPercentage: parsed.targets[index].targetPercentage,
            createdAt: now,
            updatedAt: now
          }))
        )
        .run();
    }
  })();

  const saved = getSavedPortfolioPlan();
  if (!saved) throw new Error('Portfolio plan could not be saved.');
  return saved;
}

export function clearPortfolioPlan(): void {
  getSqlite().transaction(() => {
    db.delete(portfolioPlans).where(eq(portfolioPlans.id, ACTIVE_PLAN_ID)).run();
  })();
}

export async function getPortfolioPlanning(
  overview?: PortfolioOverview,
  now = new Date()
): Promise<PortfolioPlanning> {
  const portfolio = overview ?? (await getPortfolioOverview());
  return buildPortfolioPlanning(getSavedPortfolioPlan(), portfolio, getTransactionCount() > 0, now);
}

export type PreparedPlanCurrencyConversion = {
  planId: 1;
  currency: Currency;
  targetValue: string;
  updatedAt: string;
} | null;

export async function preparePlanCurrencyConversion(
  currency: Currency,
  now = new Date()
): Promise<PreparedPlanCurrencyConversion> {
  const plan = getSavedPortfolioPlan();
  if (!plan || plan.currency === currency) return null;

  const quote = await getFxRateForDate(plan.currency, currency, now.toISOString());
  if (quote.status !== 'complete') {
    throw new Error(
      `Settings were not changed because the current ${plan.currency}/${currency} FX rate is unavailable. The saved plan target was left unchanged.`
    );
  }

  return {
    planId: ACTIVE_PLAN_ID,
    currency,
    targetValue: convertTargetValue(plan.targetValue, quote.rate),
    updatedAt: now.toISOString()
  };
}

export function applyPlanCurrencyConversion(conversion: PreparedPlanCurrencyConversion): void {
  if (!conversion) return;
  db.update(portfolioPlans)
    .set({
      currency: conversion.currency,
      targetValue: conversion.targetValue,
      updatedAt: conversion.updatedAt
    })
    .where(eq(portfolioPlans.id, conversion.planId))
    .run();
}
