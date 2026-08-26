import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { buildPortfolioPlanning, calculateContributionScenario } from '$lib/planning/calculations';
import type { SavedPortfolioPlan } from '$lib/planning/types';
import type { HoldingSummary, PortfolioOverview } from '$lib/types';
import { portfolioPlanSchema } from '$lib/validation/planning';

function target(providerCoinId: string, symbol: string, name: string, targetPercentage: string) {
  return {
    id: `coingecko:${providerCoinId}`,
    provider: 'coingecko',
    providerCoinId,
    symbol,
    name,
    imageUrl: null,
    targetPercentage
  };
}

function plan(
  targets: SavedPortfolioPlan['targets'],
  overrides: Partial<SavedPortfolioPlan> = {}
): SavedPortfolioPlan {
  return {
    id: 1,
    name: 'Long-term plan',
    targetValue: '3000',
    currency: 'EUR',
    targetDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    targets,
    ...overrides
  };
}

function holding(
  assetId: string,
  symbol: string,
  name: string,
  currentValue: string,
  priceStatus: HoldingSummary['priceStatus'] = 'fresh'
): HoldingSummary {
  return {
    assetId,
    assetSymbol: symbol,
    assetName: name,
    imageUrl: null,
    quantity: '1',
    averageCost: '1',
    currentPrice: currentValue,
    currentValue,
    totalBuyCost: '1',
    costBasis: '1',
    unrealizedProfit: '0',
    totalProfit: '0',
    roiPercent: '0',
    realizedProfit: '0',
    realizedProfitApprox: '0',
    totalFees: '0',
    allocationPercent: '0',
    stalePrice: priceStatus === 'stale',
    priceSource: priceStatus === 'missing' ? null : 'test',
    priceCapturedAt: priceStatus === 'missing' ? null : '2026-01-01T00:00:00.000Z',
    priceStatus,
    ledger: []
  };
}

function overview(
  currentValue: string,
  holdings: HoldingSummary[],
  options: { missingPriceCount?: number; excludedTransactionCount?: number } = {}
): PortfolioOverview {
  const missingPriceCount = options.missingPriceCount ?? 0;
  const excludedTransactionCount = options.excludedTransactionCount ?? 0;
  return {
    totals: {
      baseCurrency: 'EUR',
      accountingMethod: 'average_cost',
      financialDataComplete: missingPriceCount === 0 && excludedTransactionCount === 0,
      excludedTransactionCount,
      currentValue,
      investedAmount: '0',
      totalBuyCost: '0',
      unrealizedProfit: '0',
      totalProfit: '0',
      roiPercent: '0',
      realizedProfit: '0',
      realizedProfitApprox: '0',
      totalFees: '0',
      stalePriceCount: 0,
      missingPriceCount,
      fxWarningCount: excludedTransactionCount
    },
    holdings,
    allocation: [],
    portfolioSeries: [],
    portfolioSnapshotSeries: {
      range: '24h',
      snapshotType: 'hourly',
      usedFallback: false,
      hasSnapshots: false,
      points: []
    },
    priceWarnings: [],
    fxWarnings: [],
    bestPerformer: null,
    worstPerformer: null
  };
}

const btc = target('bitcoin', 'BTC', 'Bitcoin', '60');
const eth = target('ethereum', 'ETH', 'Ethereum', '40');

describe('portfolio plan validation', () => {
  const input = {
    name: 'Long-term plan',
    targetValue: '100000',
    currency: 'EUR' as const,
    targetDate: null,
    targets: [
      { asset: { ...btc, id: undefined }, targetPercentage: '60' },
      { asset: { ...eth, id: undefined }, targetPercentage: '40' }
    ].map(({ asset, targetPercentage }) => ({
      asset: {
        provider: asset.provider,
        providerCoinId: asset.providerCoinId,
        symbol: asset.symbol,
        name: asset.name,
        imageUrl: asset.imageUrl
      },
      targetPercentage
    }))
  };

  it('accepts positive unique allocation targets totaling exactly 100%', () => {
    expect(portfolioPlanSchema.safeParse(input).success).toBe(true);
    expect(portfolioPlanSchema.safeParse({ ...input, targetDate: '2020-01-01' }).success).toBe(
      true
    );
    expect(portfolioPlanSchema.safeParse({ ...input, targetDate: '2026-02-30' }).success).toBe(
      false
    );
  });

  it('rejects totals other than exactly 100%', () => {
    const result = portfolioPlanSchema.safeParse({
      ...input,
      targets: input.targets.map((row, index) => ({
        ...row,
        targetPercentage: index === 0 ? '59.999999999999999999' : row.targetPercentage
      }))
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message).join(' ')).toContain('exactly 100%');
  });

  it('rejects duplicate, missing, and non-positive target assets', () => {
    const duplicate = portfolioPlanSchema.safeParse({
      ...input,
      targets: [input.targets[0], { ...input.targets[0], targetPercentage: '40' }]
    });
    const invalid = portfolioPlanSchema.safeParse({
      ...input,
      targets: [
        {
          asset: { ...input.targets[0].asset, providerCoinId: '' },
          targetPercentage: '0'
        }
      ]
    });

    expect(duplicate.success).toBe(false);
    expect(duplicate.error?.issues.map((issue) => issue.message).join(' ')).toContain(
      'included more than once'
    );
    expect(invalid.success).toBe(false);
  });
});

describe('portfolio planning calculations', () => {
  it('calculates goal progress, drift, and value gaps with Decimal.js', () => {
    const planning = buildPortfolioPlanning(
      plan([btc, eth]),
      overview('1000', [
        holding('coingecko:bitcoin', 'BTC', 'Bitcoin', '700'),
        holding('coingecko:ethereum', 'ETH', 'Ethereum', '300')
      ]),
      true
    );

    expect(new Decimal(planning.goal?.progressPercentage ?? 0).toFixed(18)).toBe(
      '33.333333333333333333'
    );
    expect(planning.goal?.remainingValue).toBe('2000');
    expect(planning.allocationRows.find((row) => row.symbol === 'BTC')).toMatchObject({
      currentAllocationPercentage: '70',
      driftPercentagePoints: '10',
      fiatValueGap: '-100'
    });
    expect(planning.largestDrift?.absoluteDriftPercentagePoints).toBe('10');
  });

  it('handles a zero-value portfolio without division errors', () => {
    const planning = buildPortfolioPlanning(plan([btc, eth]), overview('0', []), false);

    expect(planning.goal?.progressPercentage).toBe('0');
    expect(planning.goal?.remainingValue).toBe('3000');
    expect(planning.allocationRows.map((row) => row.currentAllocationPercentage)).toEqual([
      '0',
      '0'
    ]);
    expect(planning.allocationRows.find((row) => row.symbol === 'BTC')?.fiatValueGap).toBe('0');
  });

  it('includes untargeted open holdings explicitly with a 0% target', () => {
    const planning = buildPortfolioPlanning(
      plan([btc, eth]),
      overview('1000', [
        holding('coingecko:bitcoin', 'BTC', 'Bitcoin', '500'),
        holding('coingecko:ethereum', 'ETH', 'Ethereum', '300'),
        holding('coingecko:solana', 'SOL', 'Solana', '200')
      ]),
      true
    );
    const sol = planning.allocationRows.find((row) => row.symbol === 'SOL');

    expect(sol).toMatchObject({
      targeted: false,
      targetPercentage: '0',
      currentAllocationPercentage: '20',
      driftPercentagePoints: '20',
      fiatValueGap: '-200'
    });
  });

  it('marks missing-price and incomplete-FX totals partial instead of using false zeroes', () => {
    const missingPrice = buildPortfolioPlanning(
      plan([btc, eth]),
      overview(
        '300',
        [
          holding('coingecko:bitcoin', 'BTC', 'Bitcoin', '0', 'missing'),
          holding('coingecko:ethereum', 'ETH', 'Ethereum', '300')
        ],
        { missingPriceCount: 1 }
      ),
      true
    );
    const missingFx = buildPortfolioPlanning(
      plan([btc, eth]),
      overview('0', [], { excludedTransactionCount: 2 }),
      true
    );

    expect(missingPrice.completeness.status).toBe('partial');
    expect(missingPrice.goal?.currentValue).toBeNull();
    expect(
      missingPrice.allocationRows.find((row) => row.symbol === 'BTC')?.currentValue
    ).toBeNull();
    expect(missingPrice.allocationRows.every((row) => row.driftPercentagePoints === null)).toBe(
      true
    );
    expect(missingFx.completeness.recoveryMessages.join(' ')).toContain('2 excluded transactions');
    expect(missingFx.allocationRows.every((row) => row.currentValue === null)).toBe(true);
  });

  it('distributes contributions only across positive deficits', () => {
    const planning = buildPortfolioPlanning(
      plan([btc, eth]),
      overview('1000', [
        holding('coingecko:bitcoin', 'BTC', 'Bitcoin', '800'),
        holding('coingecko:ethereum', 'ETH', 'Ethereum', '200')
      ]),
      true
    );
    const scenario = calculateContributionScenario(planning, '100');

    expect(scenario.rows.find((row) => row.symbol === 'BTC')?.hypotheticalAmount).toBe('0');
    expect(scenario.rows.find((row) => row.symbol === 'ETH')?.hypotheticalAmount).toBe('100');
    expect(scenario.distributedTotal).toBe('100');
  });

  it('allocates the full contribution without decimal residue', () => {
    const thirds = [
      target('bitcoin', 'BTC', 'Bitcoin', '33.333333333333333333'),
      target('ethereum', 'ETH', 'Ethereum', '33.333333333333333333'),
      target('solana', 'SOL', 'Solana', '33.333333333333333334')
    ];
    const scenario = calculateContributionScenario(
      buildPortfolioPlanning(plan(thirds), overview('0', []), false),
      '100'
    );
    const sum = scenario.rows.reduce(
      (total, row) => total.plus(row.hypotheticalAmount),
      new Decimal(0)
    );

    expect(sum.toString()).toBe('100');
    expect(scenario.distributedTotal).toBe('100');
  });
});
