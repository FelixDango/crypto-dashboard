<script lang="ts">
  import { Plus, TriangleAlert } from '@lucide/svelte';
  import type { EChartsOption } from 'echarts';
  import Chart from '$lib/components/Chart.svelte';
  import { formatCurrency, formatPercent, signedClass } from '$lib/format';
  import type { PortfolioOverview } from '$lib/types';

  export let data: {
    overview: PortfolioOverview;
  };

  let allocationOption: EChartsOption;
  let valueOption: EChartsOption;

  $: overview = data.overview;
  $: currency = overview.totals.baseCurrency;
  $: allocationOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#99a5ad' } },
    series: [
      {
        type: 'pie',
        radius: ['52%', '72%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        label: { color: '#edf2f4' },
        data: overview.allocation.map((item) => ({
          name: item.label,
          value: Number(item.value)
        }))
      }
    ],
    color: ['#2dd4bf', '#60a5fa', '#f59e0b', '#fb7185', '#a3e635', '#c084fc']
  };
  $: valueOption = {
    backgroundColor: 'transparent',
    grid: { left: 16, right: 14, top: 18, bottom: 30, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: overview.portfolioSeries.map((point) => point.label),
      axisLabel: { color: '#99a5ad' },
      axisLine: { lineStyle: { color: '#2a343b' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#99a5ad' },
      splitLine: { lineStyle: { color: '#2a343b' } }
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbolSize: 7,
        areaStyle: { color: 'rgba(45, 212, 191, 0.12)' },
        lineStyle: { color: '#2dd4bf', width: 3 },
        itemStyle: { color: '#2dd4bf' },
        data: overview.portfolioSeries.map((point) => Number(point.value))
      }
    ]
  };
</script>

<section class="page">
  <div class="page-header">
    <div class="page-title">
      <h1>Dashboard</h1>
      <p class="muted">Average-cost portfolio view in {currency}</p>
    </div>
    <a class="btn primary" href="/transactions">
      <Plus size={18} />
      Add transaction
    </a>
  </div>

  {#if overview.priceWarnings.length > 0}
    <div class="notice warning-list">
      <TriangleAlert size={18} />
      <span>{overview.priceWarnings[0]}</span>
    </div>
  {/if}

  <div class="grid metric-grid">
    <article class="card metric-card">
      <span class="label">Portfolio value</span>
      <strong class="value">{formatCurrency(overview.totals.currentValue, currency)}</strong>
      <span class="meta">{overview.totals.stalePriceCount} stale prices</span>
    </article>
    <article class="card metric-card">
      <span class="label">Invested</span>
      <strong class="value">{formatCurrency(overview.totals.investedAmount, currency)}</strong>
      <span class="meta">Open cost basis</span>
    </article>
    <article class="card metric-card">
      <span class="label">Unrealized P/L</span>
      <strong class="value {signedClass(overview.totals.unrealizedProfit)}">
        {formatCurrency(overview.totals.unrealizedProfit, currency)}
      </strong>
      <span class="meta">Current value minus open cost</span>
    </article>
    <article class="card metric-card">
      <span class="label">ROI</span>
      <strong class="value {signedClass(overview.totals.roiPercent)}">
        {formatPercent(overview.totals.roiPercent)}
      </strong>
      <span class="meta">Average-cost basis</span>
    </article>
  </div>

  <div class="grid two-column dashboard-main">
    <section class="card">
      <div class="section-head">
        <h2>Portfolio value</h2>
        <span class="muted">cached snapshots</span>
      </div>
      {#if overview.holdings.length === 0}
        <div class="empty-state">
          <h2>No transactions yet</h2>
          <a class="btn primary" href="/transactions">Add your first buy</a>
        </div>
      {:else}
        <Chart option={valueOption} label="Portfolio value chart" />
      {/if}
    </section>

    <section class="card">
      <div class="section-head">
        <h2>Allocation</h2>
        <span class="muted">{overview.allocation.length} assets</span>
      </div>
      {#if overview.allocation.length === 0}
        <div class="empty-state">
          <p class="muted">Allocation appears after holdings exist.</p>
        </div>
      {:else}
        <Chart option={allocationOption} label="Portfolio allocation chart" />
      {/if}
    </section>
  </div>

  <div class="grid performer-grid">
    <section class="card performer">
      <span class="muted">Best performer</span>
      {#if overview.bestPerformer}
        <strong>{overview.bestPerformer.assetSymbol}</strong>
        <span class={signedClass(overview.bestPerformer.roiPercent)}>
          {formatPercent(overview.bestPerformer.roiPercent)}
        </span>
      {:else}
        <strong>-</strong>
        <span class="muted">No open position</span>
      {/if}
    </section>

    <section class="card performer">
      <span class="muted">Worst performer</span>
      {#if overview.worstPerformer}
        <strong>{overview.worstPerformer.assetSymbol}</strong>
        <span class={signedClass(overview.worstPerformer.roiPercent)}>
          {formatPercent(overview.worstPerformer.roiPercent)}
        </span>
      {:else}
        <strong>-</strong>
        <span class="muted">No open position</span>
      {/if}
    </section>

    <section class="card performer">
      <span class="muted">Realized P/L</span>
      <strong class={signedClass(overview.totals.realizedProfitApprox)}>
        {formatCurrency(overview.totals.realizedProfitApprox, currency)}
      </strong>
      <span class="muted">Approximate</span>
    </section>
  </div>
</section>

<style>
  .warning-list {
    align-items: center;
    display: flex;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }

  .dashboard-main {
    margin-top: 1rem;
  }

  .section-head {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.8rem;
  }

  .performer-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 1rem;
  }

  .performer {
    display: grid;
    gap: 0.4rem;
  }

  .performer strong {
    font-size: 1.35rem;
  }

  @media (max-width: 820px) {
    .performer-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
