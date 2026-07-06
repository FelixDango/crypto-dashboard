import { describe, expect, it } from 'vitest';
import {
  calculateAllocation,
  calculateConcentration,
  calculateDrawdowns,
  calculateMaxDrawdown,
  calculateMonthlyContributions,
  calculateMonthlyPnl,
  calculatePeriodChange,
  calculateRunningAth
} from '$lib/server/analytics/calculations';

describe('analytics calculations', () => {
  it('calculates running ATH values', () => {
    const points = calculateRunningAth([
      { value: '100' },
      { value: '150' },
      { value: '120' },
      { value: '180' }
    ]);

    expect(points.map((point) => point.runningAth)).toEqual(['100', '150', '150', '180']);
  });

  it('calculates drawdowns from previous ATH', () => {
    const points = calculateDrawdowns([
      { value: '100' },
      { value: '150' },
      { value: '120' },
      { value: '180' }
    ]);

    expect(points.map((point) => point.drawdownPercent)).toEqual(['0', '0', '-20', '0']);
  });

  it('calculates max drawdown', () => {
    const max = calculateMaxDrawdown([
      { value: '100' },
      { value: '200' },
      { value: '120' },
      { value: '90' }
    ]);

    expect(max).toBe('-55');
  });

  it('calculates 24h, 7d, and 30d period changes', () => {
    const points = [
      { value: '100', bucketAt: '2026-01-01T00:00:00.000Z' },
      { value: '125', bucketAt: '2026-01-02T00:00:00.000Z' }
    ];

    expect(calculatePeriodChange(points, '24h', '24h').percentChange).toBe('25');
    expect(calculatePeriodChange(points, '7d', '7d').valueChange).toBe('25');
    expect(calculatePeriodChange(points, '30d', '30d').available).toBe(true);
  });

  it('calculates monthly contributions', () => {
    const contributions = calculateMonthlyContributions([
      {
        type: 'buy',
        fiatAmount: '100',
        feeAmount: '10',
        transactionDate: '2026-01-05T12:00:00.000Z'
      },
      {
        type: 'sell',
        fiatAmount: '40',
        feeAmount: '2',
        transactionDate: '2026-01-20T12:00:00.000Z'
      }
    ]);

    expect(contributions[0]).toMatchObject({
      month: '2026-01',
      monthlyBuyCost: '110',
      monthlySellProceeds: '38',
      netContribution: '72'
    });
  });

  it('calculates monthly P/L with buys', () => {
    const pnl = calculateMonthlyPnl(
      [
        { bucketAt: '2026-01-01T00:00:00.000Z', value: '1000' },
        { bucketAt: '2026-01-31T00:00:00.000Z', value: '1200' }
      ],
      [
        {
          month: '2026-01',
          label: 'Jan 2026',
          monthlyBuyCost: '100',
          monthlySellProceeds: '0',
          netContribution: '100'
        }
      ]
    );

    expect(pnl[0].complete).toBe(true);
    expect(pnl[0].monthlyPnl).toBe('100');
  });

  it('calculates monthly P/L with sells', () => {
    const pnl = calculateMonthlyPnl(
      [
        { bucketAt: '2026-02-01T00:00:00.000Z', value: '1200' },
        { bucketAt: '2026-02-28T00:00:00.000Z', value: '1000' }
      ],
      [
        {
          month: '2026-02',
          label: 'Feb 2026',
          monthlyBuyCost: '0',
          monthlySellProceeds: '100',
          netContribution: '-100'
        }
      ]
    );

    expect(pnl[0].monthlyPnl).toBe('-100');
  });

  it('calculates allocation percentage and concentration score', () => {
    const allocation = calculateAllocation(
      [
        {
          assetId: 'btc',
          assetSymbol: 'BTC',
          assetName: 'Bitcoin',
          currentQuantity: '1',
          currentValue: '700',
          costBasis: '500',
          unrealizedProfit: '200',
          realizedProfit: '0',
          totalProfit: '200',
          roiPercent: '40',
          currentPrice: '700',
          priceStatus: 'fresh'
        },
        {
          assetId: 'eth',
          assetSymbol: 'ETH',
          assetName: 'Ethereum',
          currentQuantity: '1',
          currentValue: '300',
          costBasis: '250',
          unrealizedProfit: '50',
          realizedProfit: '0',
          totalProfit: '50',
          roiPercent: '20',
          currentPrice: '300',
          priceStatus: 'fresh'
        }
      ],
      new Map([['btc', '50']])
    );
    const concentration = calculateConcentration(allocation, 60);

    expect(allocation[0].allocationPercent).toBe('70');
    expect(allocation[0].allocationDriftPercent).toBe('20');
    expect(concentration.topAssetWeightPercent).toBe('70');
    expect(concentration.status).toBe('warning');
  });
});
