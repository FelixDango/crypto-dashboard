<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Camera, Plus, RefreshCw, TriangleAlert } from '@lucide/svelte';
  import type { EChartsOption } from 'echarts';
  import Chart from '$lib/components/Chart.svelte';
  import CycleCard from '$lib/components/CycleCard.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import { formatCurrency, formatPercent, signedClass } from '$lib/format';
  import type { CycleProgress, CycleWindow } from '$lib/server/insights/market-cycle';
  import type { PortfolioOverview, SnapshotRange } from '$lib/types';

  export let data: {
    overview: PortfolioOverview;
    cycle: CycleProgress | null;
    cycleWindows: CycleWindow[];
    snapshotRange: SnapshotRange;
    snapshotRanges: { value: SnapshotRange; label: string }[];
  };
  export let form: {
    snapshotError?: string;
    snapshotResult?: string;
    snapshotBucket?: string;
  } | null = null;

  let allocationOption: EChartsOption;
  let valueOption: EChartsOption;
  let showCycleOverlay = false;
  let refreshing = false;
  let refreshError = '';

  $: overview = data.overview;
  $: currency = overview.totals.baseCurrency;
  $: snapshotSeries = overview.portfolioSnapshotSeries;
  $: selectedRange = data.snapshotRange;
  $: warnings = [...overview.priceWarnings, ...overview.fxWarnings];
  $: alertMessages = [refreshError, form?.snapshotError, ...warnings].filter(
    (message): message is string => Boolean(message)
  );
  $: chartSummary = `Portfolio value is ${formatCurrency(
    overview.totals.currentValue,
    currency
  )}. Total profit and loss is ${formatCurrency(overview.totals.totalProfit, currency)}.`;
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
      type: 'time',
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
        data: overview.portfolioSeries.map(
          (point) => [point.bucketAt, Number(point.value)] as [string, number]
        ),
        markArea: cycleMarkArea(showCycleOverlay)
      }
    ]
  };

  function cycleMarkArea(enabled: boolean) {
    if (!enabled) return undefined;

    return {
      silent: true,
      itemStyle: { opacity: 0.08 },
      data: data.cycleWindows.map(
        (window) =>
          [
            {
              xAxis: window.phaseStart,
              itemStyle: { color: window.phase === 'bull' ? '#22c55e' : '#fb7185' }
            },
            { xAxis: window.phaseEndExclusive }
          ] as [{ xAxis: string; itemStyle: { color: string } }, { xAxis: string }]
      )
    };
  }

  async function refreshPrices() {
    refreshing = true;
    refreshError = '';
    try {
      const response = await fetch('/api/prices/refresh', { method: 'POST' });
      if (!response.ok) throw new Error('Price refresh failed.');
      await invalidateAll();
    } catch (error) {
      refreshError = error instanceof Error ? error.message : 'Price refresh failed.';
    } finally {
      refreshing = false;
    }
  }
</script>

<section class="page">
  <div class="page-header">
    <div class="page-title">
      <h1>Dashboard</h1>
      <p class="muted">FIFO portfolio view in {currency}</p>
    </div>
    <div class="toolbar">
      <button class="btn" type="button" on:click={refreshPrices} disabled={refreshing}>
        <RefreshCw size={18} />
        {refreshing ? 'Refreshing' : 'Refresh prices'}
      </button>
      <a class="btn primary" href="/transactions">
        <Plus size={18} />
        Add transaction
      </a>
    </div>
  </div>

  {#if alertMessages.length > 0}
    <div class="notice warning-list">
      <TriangleAlert size={18} />
      <div>
        {#each alertMessages as message}
          <span>{message}</span>
        {/each}
      </div>
    </div>
  {/if}

  <CycleCard progress={data.cycle} compact />

  <div class="grid metric-grid dashboard-metrics">
    <article class="card metric-card">
      <span class="label">Portfolio value</span>
      <PrivacyValue
        className="value"
        value={formatCurrency(overview.totals.currentValue, currency)}
        kind="fiat"
      />
      <span class="meta">
        {overview.totals.stalePriceCount} stale / {overview.totals.missingPriceCount} missing
      </span>
    </article>
    <article class="card metric-card">
      <span class="label">Open cost basis</span>
      <PrivacyValue
        className="value"
        value={formatCurrency(overview.totals.investedAmount, currency)}
        kind="fiat"
      />
      <span class="meta">Remaining FIFO lots</span>
    </article>
    <article class="card metric-card">
      <span class="label">Unrealized P/L</span>
      <PrivacyValue
        className={`value ${signedClass(overview.totals.unrealizedProfit)}`}
        value={formatCurrency(overview.totals.unrealizedProfit, currency)}
        kind="fiat"
      />
      <span class="meta">
        {overview.totals.missingPriceCount > 0
          ? 'Excludes missing market prices'
          : 'Current value minus open cost'}
      </span>
    </article>
    <article class="card metric-card">
      <span class="label">Realized P/L</span>
      <PrivacyValue
        className={`value ${signedClass(overview.totals.realizedProfit)}`}
        value={formatCurrency(overview.totals.realizedProfit, currency)}
        kind="fiat"
      />
      <span class="meta">Closed FIFO disposals</span>
    </article>
    <article class="card metric-card">
      <span class="label">Total P/L</span>
      <PrivacyValue
        className={`value ${signedClass(overview.totals.totalProfit)}`}
        value={formatCurrency(overview.totals.totalProfit, currency)}
        kind="fiat"
      />
      <span class="meta">
        {overview.totals.missingPriceCount > 0
          ? 'Excludes missing market prices'
          : 'Realized plus unrealized'}
      </span>
    </article>
    <article class="card metric-card">
      <span class="label">Total ROI</span>
      <strong class="value {signedClass(overview.totals.roiPercent)}">
        {formatPercent(overview.totals.roiPercent)}
      </strong>
      <span class="meta">{overview.totals.fxWarningCount} FX warnings</span>
    </article>
  </div>

  <div class="grid two-column dashboard-main">
    <section class="card">
      <div class="section-head chart-head">
        <div class="section-title">
          <h2>Portfolio value</h2>
          <span class="muted">
            {snapshotSeries.snapshotType}{snapshotSeries.usedFallback ? ' fallback' : ''}
          </span>
        </div>
        <nav class="range-tabs" aria-label="Snapshot range">
          {#each data.snapshotRanges as range}
            <a
              class:active={selectedRange === range.value}
              href={`/dashboard?range=${range.value}`}
              aria-current={selectedRange === range.value ? 'page' : undefined}
            >
              {range.label}
            </a>
          {/each}
        </nav>
        <label class="overlay-toggle">
          <input type="checkbox" bind:checked={showCycleOverlay} />
          <span>Cycle overlay</span>
        </label>
      </div>
      {#if overview.holdings.length === 0}
        <div class="empty-state">
          <h2>No transactions yet</h2>
          <a class="btn primary" href="/transactions">Add your first buy</a>
        </div>
      {:else if !snapshotSeries.hasSnapshots}
        <div class="empty-state">
          <h2>No snapshots yet</h2>
          <form method="POST" action="?/createSnapshot">
            <button class="btn primary" type="submit">
              <Camera size={18} />
              Create snapshot now
            </button>
          </form>
        </div>
      {:else if overview.portfolioSeries.length === 0}
        <div class="empty-state">
          <h2>No snapshot data</h2>
          <p class="muted">No {snapshotSeries.snapshotType} snapshots in this range.</p>
        </div>
      {:else}
        <Chart
          option={valueOption}
          label="Portfolio value chart"
          summary={chartSummary}
          sensitive
        />
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
        <Chart
          option={allocationOption}
          label="Portfolio allocation chart"
          summary={`${overview.allocation.length} assets are included in allocation.`}
        />
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
      <PrivacyValue
        className={`performer-amount ${signedClass(overview.totals.realizedProfit)}`}
        value={formatCurrency(overview.totals.realizedProfit, currency)}
        kind="fiat"
      />
      <span class="muted">FIFO disposals</span>
    </section>

    <section class="card performer">
      <span class="muted">Total fees</span>
      <PrivacyValue
        className="performer-amount"
        value={formatCurrency(overview.totals.totalFees, currency)}
        kind="fiat"
      />
      <span class="muted">Normalized into {currency}</span>
    </section>
  </div>
</section>

<style>
  .warning-list {
    align-items: flex-start;
    display: flex;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }

  .warning-list div {
    display: grid;
    gap: 0.25rem;
  }

  .toolbar {
    display: flex;
    gap: 0.5rem;
  }

  .dashboard-main {
    margin-top: 1rem;
  }

  .cycle-card {
    margin-bottom: 1rem;
  }

  .dashboard-metrics {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .section-head {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.8rem;
  }

  .chart-head {
    align-items: flex-start;
    gap: 0.8rem;
  }

  .section-title {
    display: grid;
    gap: 0.25rem;
  }

  .range-tabs {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    gap: 0.2rem;
    padding: 0.2rem;
  }

  .overlay-toggle {
    align-items: center;
    color: var(--muted);
    display: inline-flex;
    font-size: 0.82rem;
    font-weight: 800;
    gap: 0.45rem;
    min-height: 2rem;
    white-space: nowrap;
  }

  .overlay-toggle input {
    accent-color: var(--accent);
    min-height: auto;
    width: auto;
  }

  .range-tabs a {
    align-items: center;
    border-radius: 6px;
    color: var(--muted);
    display: inline-flex;
    font-size: 0.82rem;
    font-weight: 800;
    justify-content: center;
    min-height: 2rem;
    min-width: 2.6rem;
    padding: 0 0.55rem;
  }

  .range-tabs a:hover,
  .range-tabs a.active {
    background: var(--surface-strong);
    color: var(--text);
  }

  .performer-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-top: 1rem;
  }

  .performer {
    display: grid;
    gap: 0.4rem;
  }

  .performer strong,
  :global(.performer-amount) {
    font-size: 1.35rem;
    font-weight: 700;
  }

  @media (max-width: 1180px) {
    .dashboard-metrics {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 820px) {
    .dashboard-metrics {
      grid-template-columns: 1fr;
    }

    .performer-grid {
      grid-template-columns: 1fr;
    }

    .toolbar {
      display: grid;
      grid-template-columns: 1fr;
      width: 100%;
    }

    .chart-head,
    .range-tabs {
      width: 100%;
    }

    .chart-head {
      display: grid;
    }

    .range-tabs {
      overflow-x: auto;
    }
  }
</style>
