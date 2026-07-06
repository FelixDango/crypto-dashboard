<script lang="ts">
  import {
    AlertTriangle,
    CheckCircle2,
    RefreshCw,
    ShieldAlert,
    TrendingDown,
    XCircle
  } from '@lucide/svelte';
  import type { EChartsOption } from 'echarts';
  import Chart from '$lib/components/Chart.svelte';
  import type {
    AnalyticsAllocationResponse,
    AnalyticsDrawdownResponse,
    AnalyticsHealthStatus,
    AnalyticsHealthSummary,
    AnalyticsMonthlyResponse,
    AnalyticsPerformanceResponse,
    AnalyticsRange,
    AnalyticsSummary,
    AssetPriceFreshnessStatus
  } from '$lib/analytics/types';
  import {
    formatCrypto,
    formatCurrency,
    formatDateTime,
    formatPercent,
    signedClass
  } from '$lib/format';

  export let data: {
    range: AnalyticsRange;
    ranges: { value: AnalyticsRange; label: string }[];
    summary: AnalyticsSummary;
    performance: AnalyticsPerformanceResponse;
    drawdown: AnalyticsDrawdownResponse;
    monthly: AnalyticsMonthlyResponse;
    allocation: AnalyticsAllocationResponse;
    health: AnalyticsHealthSummary;
  };

  let selectedRange = data.range;
  let performance = data.performance;
  let drawdown = data.drawdown;
  let rangeLoading = false;
  let rangeError = '';

  $: currency = data.summary.currency;
  $: oneYearChange = data.summary.changes['1y'];
  $: changeCards = ['24h', '7d', '30d', '90d', '1y'].map((range) => {
    const metric = data.summary.changes[range as AnalyticsRange];
    return {
      label: `${metric.label} change`,
      value: metric.available && metric.percentChange ? formatPercent(metric.percentChange) : '-',
      className: metric.available ? signedClass(metric.percentChange ?? 0) : 'neutral',
      meta: metric.available
        ? `${formatCurrency(metric.valueChange ?? 0, currency)} portfolio value change`
        : (metric.message ?? 'Not enough history')
    };
  });
  $: valueOption = lineOption(
    performance.series.points.map((point) => point.label),
    performance.series.points.map((point) => Number(point.value)),
    'Portfolio value',
    '#2dd4bf',
    true
  );
  $: drawdownOption = lineOption(
    drawdown.points.map((point) => point.label),
    drawdown.points.map((point) => Number(point.drawdownPercent)),
    'Drawdown',
    '#fb7185',
    true
  );
  $: contributionOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, textStyle: { color: '#99a5ad' } },
    grid: { left: 16, right: 14, top: 18, bottom: 52, containLabel: true },
    xAxis: {
      type: 'category',
      data: data.monthly.contributions.map((point) => point.label),
      axisLabel: { color: '#99a5ad' },
      axisLine: { lineStyle: { color: '#2a343b' } }
    },
    yAxis: axisValue(),
    series: [
      {
        name: 'Buy cost',
        type: 'bar',
        stack: 'cashflow',
        itemStyle: { color: '#60a5fa' },
        data: data.monthly.contributions.map((point) => Number(point.monthlyBuyCost))
      },
      {
        name: 'Sell proceeds',
        type: 'bar',
        stack: 'cashflow',
        itemStyle: { color: '#f59e0b' },
        data: data.monthly.contributions.map((point) => -Number(point.monthlySellProceeds))
      },
      {
        name: 'Net contribution',
        type: 'line',
        symbolSize: 7,
        lineStyle: { color: '#2dd4bf', width: 3 },
        itemStyle: { color: '#2dd4bf' },
        data: data.monthly.contributions.map((point) => Number(point.netContribution))
      }
    ]
  } satisfies EChartsOption;
  $: completePnl = data.monthly.pnl.filter((point) => point.complete);
  $: pnlOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 16, right: 14, top: 18, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: completePnl.map((point) => point.label),
      axisLabel: { color: '#99a5ad' },
      axisLine: { lineStyle: { color: '#2a343b' } }
    },
    yAxis: axisValue(),
    series: [
      {
        name: 'Cash-flow adjusted P/L',
        type: 'bar',
        data: completePnl.map((point) => {
          const value = Number(point.monthlyPnl ?? 0);
          return {
            value,
            itemStyle: { color: value >= 0 ? '#22c55e' : '#fb7185' }
          };
        })
      }
    ]
  } satisfies EChartsOption;
  $: allocationOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#99a5ad' } },
    series: [
      {
        type: 'pie',
        radius: ['50%', '72%'],
        center: ['50%', '43%'],
        avoidLabelOverlap: true,
        label: { color: '#edf2f4' },
        data: data.allocation.assets.map((asset) => ({
          name: asset.assetSymbol,
          value: Number(asset.currentValue)
        }))
      }
    ],
    color: ['#2dd4bf', '#60a5fa', '#f59e0b', '#fb7185', '#a3e635', '#c084fc']
  } satisfies EChartsOption;

  function axisValue() {
    return {
      type: 'value' as const,
      axisLabel: { color: '#99a5ad' },
      splitLine: { lineStyle: { color: '#2a343b' } }
    };
  }

  function lineOption(
    labels: string[],
    values: number[],
    name: string,
    color: string,
    fill = false
  ): EChartsOption {
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 16, right: 14, top: 18, bottom: 30, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { color: '#99a5ad' },
        axisLine: { lineStyle: { color: '#2a343b' } }
      },
      yAxis: axisValue(),
      series: [
        {
          name,
          type: 'line',
          smooth: true,
          symbolSize: 7,
          areaStyle: fill ? { color: `${color}22` } : undefined,
          lineStyle: { color, width: 3 },
          itemStyle: { color },
          data: values
        }
      ]
    };
  }

  function statusLabel(status: AnalyticsHealthStatus | AssetPriceFreshnessStatus): string {
    if (status === 'healthy') return 'Healthy';
    if (status === 'warning') return 'Warning';
    if (status === 'broken') return 'Broken';
    if (status === 'fresh') return 'Fresh';
    if (status === 'stale') return 'Stale';
    if (status === 'missing') return 'Missing';
    return 'Failed';
  }

  function statusClass(status: AnalyticsHealthStatus | AssetPriceFreshnessStatus): string {
    if (status === 'healthy' || status === 'fresh') return 'healthy';
    if (status === 'warning' || status === 'stale') return 'warning';
    return 'broken';
  }

  function optionalCurrency(value: string | null, targetCurrency = currency): string {
    return value === null ? '-' : formatCurrency(value, targetCurrency);
  }

  function optionalPercent(value: string | null): string {
    return value === null ? '-' : formatPercent(value);
  }

  async function selectRange(range: AnalyticsRange) {
    if (range === selectedRange || rangeLoading) return;

    rangeLoading = true;
    rangeError = '';
    try {
      const [performanceResponse, drawdownResponse] = await Promise.all([
        fetch(`/api/analytics/performance?range=${range}`),
        fetch(`/api/analytics/drawdown?range=${range}`)
      ]);
      if (!performanceResponse.ok || !drawdownResponse.ok) {
        throw new Error('Range data failed to load.');
      }

      performance = (await performanceResponse.json()) as AnalyticsPerformanceResponse;
      drawdown = (await drawdownResponse.json()) as AnalyticsDrawdownResponse;
      selectedRange = range;

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('range', range);
      window.history.replaceState({}, '', nextUrl);
    } catch (error) {
      rangeError = error instanceof Error ? error.message : 'Range data failed to load.';
    } finally {
      rangeLoading = false;
    }
  }
</script>

<section class="page analytics-page">
  <div class="page-header">
    <div class="page-title">
      <h1>Analytics</h1>
      <p class="muted">Portfolio performance, allocation, and data health in {currency}</p>
    </div>
    <div class="health-pill {statusClass(data.health.status)}">
      {#if data.health.status === 'healthy'}
        <CheckCircle2 size={18} />
      {:else if data.health.status === 'warning'}
        <AlertTriangle size={18} />
      {:else}
        <XCircle size={18} />
      {/if}
      <span>{statusLabel(data.health.status)}</span>
    </div>
  </div>

  {#if data.summary.messages.length > 0}
    <div class="notice analytics-notice">
      <AlertTriangle size={18} />
      <span>{data.summary.messages[0]}</span>
    </div>
  {/if}

  <div class="grid analytics-metrics">
    <article class="card metric-card">
      <span class="label">Current portfolio value</span>
      <strong class="value">{formatCurrency(data.summary.currentValue, currency)}</strong>
      <span class="meta">Latest accounting view</span>
    </article>
    <article class="card metric-card">
      <span class="label">All-time high value</span>
      <strong class="value">{optionalCurrency(data.summary.allTimeHighValue)}</strong>
      <span class="meta">{formatDateTime(data.summary.allTimeHighAt)}</span>
    </article>
    <article class="card metric-card">
      <span class="label">Current drawdown from ATH</span>
      <strong class="value {signedClass(data.summary.currentDrawdownPercent ?? 0)}">
        {optionalPercent(data.summary.currentDrawdownPercent)}
      </strong>
      <span class="meta">Drawdown is zero or negative</span>
    </article>
    <article class="card metric-card">
      <span class="label">Max drawdown</span>
      <strong class="value {signedClass(data.summary.maxDrawdownPercent ?? 0)}">
        {optionalPercent(data.summary.maxDrawdownPercent)}
      </strong>
      <span class="meta">Worst historical drawdown</span>
    </article>
    {#each changeCards as card}
      <article class="card metric-card">
        <span class="label">{card.label}</span>
        <strong class="value {card.className}">{card.value}</strong>
        <span class="meta">{card.meta}</span>
      </article>
    {/each}
    <article class="card metric-card">
      <span class="label">Total invested</span>
      <strong class="value">{formatCurrency(data.summary.totalInvested, currency)}</strong>
      <span class="meta">Buy cost plus fees</span>
    </article>
    <article class="card metric-card">
      <span class="label">Accounting P/L</span>
      <strong class="value {signedClass(data.summary.totalProfit)}">
        {formatCurrency(data.summary.totalProfit, currency)}
      </strong>
      <span class="meta">Realized plus unrealized</span>
    </article>
    <article class="card metric-card">
      <span class="label">Total ROI</span>
      <strong class="value {signedClass(data.summary.totalRoiPercent)}">
        {formatPercent(data.summary.totalRoiPercent)}
      </strong>
      <span class="meta"
        >{oneYearChange.available ? '1y history available' : '1y needs more data'}</span
      >
    </article>
  </div>

  <div class="grid two-column analytics-main">
    <section class="card chart-card">
      <div class="section-head chart-head">
        <div class="section-title">
          <h2>Portfolio value over time</h2>
          <span class="muted">
            {performance.series.snapshotType}{performance.series.usedFallback ? ' fallback' : ''}
          </span>
        </div>
        <div class="range-tabs" aria-label="Analytics range">
          {#each data.ranges as range}
            <button
              class:active={selectedRange === range.value}
              disabled={rangeLoading}
              type="button"
              on:click={() => selectRange(range.value)}
            >
              {range.label}
            </button>
          {/each}
        </div>
      </div>
      {#if rangeError}
        <div class="notice inline-notice">{rangeError}</div>
      {/if}
      {#if performance.series.messages.length > 0}
        <div class="partial-state">{performance.series.messages[0]}</div>
      {/if}
      {#if rangeLoading}
        <div class="loading-state">
          <RefreshCw size={18} />
          <span>Loading range</span>
        </div>
      {:else if performance.series.points.length === 0}
        <div class="empty-state">
          <h2>No snapshot data</h2>
          <p class="muted">Portfolio value charts appear after snapshots are recorded.</p>
        </div>
      {:else}
        <Chart
          option={valueOption}
          label="Portfolio value over time"
          summary={`${performance.series.points.length} portfolio value points are shown.`}
        />
      {/if}
    </section>

    <section class="card chart-card">
      <div class="section-head">
        <div class="section-title">
          <h2>Drawdown</h2>
          <span class="muted">From previous ATH</span>
        </div>
        <TrendingDown size={20} />
      </div>
      {#if drawdown.points.length === 0}
        <div class="empty-state">
          <p class="muted">Drawdown needs snapshot history.</p>
        </div>
      {:else}
        <Chart
          option={drawdownOption}
          label="Drawdown chart"
          summary={`Max drawdown is ${formatPercent(drawdown.maxDrawdownPercent)}.`}
        />
      {/if}
    </section>
  </div>

  <div class="grid two-column analytics-main">
    <section class="card chart-card">
      <div class="section-head">
        <div class="section-title">
          <h2>Monthly contribution</h2>
          <span class="muted">Buy cost, sell proceeds, and net contribution</span>
        </div>
      </div>
      {#if data.monthly.contributions.length === 0}
        <div class="empty-state">
          <p class="muted">Monthly contribution appears after transactions exist.</p>
        </div>
      {:else}
        <Chart
          option={contributionOption}
          label="Monthly contribution chart"
          summary={`${data.monthly.contributions.length} monthly contribution buckets are shown.`}
        />
      {/if}
    </section>

    <section class="card chart-card">
      <div class="section-head">
        <div class="section-title">
          <h2>Monthly P/L</h2>
          <span class="muted">Cash-flow adjusted P/L</span>
        </div>
      </div>
      {#if completePnl.length === 0}
        <div class="empty-state">
          <p class="muted">Monthly P/L needs start and end daily snapshots.</p>
        </div>
      {:else}
        <Chart
          option={pnlOption}
          label="Monthly P/L chart"
          summary={`${completePnl.length} complete monthly P/L buckets are shown.`}
        />
      {/if}
    </section>
  </div>

  <section class="card allocation-section">
    <div class="section-head">
      <div class="section-title">
        <h2>Allocation analytics</h2>
        <span class="muted">Current weights and drift since first snapshot</span>
      </div>
      <span class="status {statusClass(data.allocation.concentration.status)}">
        {statusLabel(data.allocation.concentration.status)}
      </span>
    </div>
    {#if data.allocation.concentration.warning}
      <div class="notice inline-notice">
        <ShieldAlert size={18} />
        <span>{data.allocation.concentration.warning}</span>
      </div>
    {/if}
    <div class="allocation-grid">
      <div>
        {#if data.allocation.assets.length === 0}
          <div class="empty-state">
            <p class="muted">Allocation appears after active holdings exist.</p>
          </div>
        {:else}
          <Chart
            option={allocationOption}
            label="Current allocation by asset"
            summary={`${data.allocation.assets.length} assets are included in allocation.`}
          />
        {/if}
      </div>
      <div class="allocation-stats">
        <article>
          <span class="muted">Largest position</span>
          <strong>{data.allocation.concentration.largestPosition?.assetSymbol ?? '-'}</strong>
          <span>{formatPercent(data.allocation.concentration.topAssetWeightPercent)}</span>
        </article>
        <article>
          <span class="muted">Smallest position</span>
          <strong>{data.allocation.concentration.smallestPosition?.assetSymbol ?? '-'}</strong>
          <span>
            {data.allocation.concentration.smallestPosition
              ? formatPercent(data.allocation.concentration.smallestPosition.allocationPercent)
              : '-'}
          </span>
        </article>
        <article>
          <span class="muted">Concentration score</span>
          <strong>{formatPercent(data.allocation.concentration.topAssetWeightPercent)}</strong>
          <span>Threshold {formatPercent(data.allocation.concentration.thresholdPercent)}</span>
        </article>
      </div>
    </div>
  </section>

  <section class="card">
    <div class="section-head">
      <div class="section-title">
        <h2>Asset performance</h2>
        <span class="muted">Accounting P/L by current holding</span>
      </div>
    </div>
    {#if data.allocation.assets.length === 0}
      <div class="empty-state">
        <p class="muted">Asset analytics appear after active holdings exist.</p>
      </div>
    {:else}
      <div class="table-wrap mobile-cards">
        <table class="mobile-card-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Quantity</th>
              <th>Value</th>
              <th>Cost basis</th>
              <th>Unrealized P/L</th>
              <th>Realized P/L</th>
              <th>Total P/L</th>
              <th>ROI</th>
              <th>Allocation</th>
              <th>Drift</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {#each data.allocation.assets as asset}
              <tr>
                <td class="primary-cell" data-label="Asset">
                  <strong>{asset.assetSymbol}</strong>
                  <span class="muted">{asset.assetName}</span>
                </td>
                <td data-label="Quantity">{formatCrypto(asset.currentQuantity)}</td>
                <td data-label="Value">{formatCurrency(asset.currentValue, currency)}</td>
                <td data-label="Cost basis">{formatCurrency(asset.costBasis, currency)}</td>
                <td class={signedClass(asset.unrealizedProfit)} data-label="Unrealized P/L">
                  {formatCurrency(asset.unrealizedProfit, currency)}
                </td>
                <td
                  class={asset.realizedProfit ? signedClass(asset.realizedProfit) : 'neutral'}
                  data-label="Realized P/L"
                >
                  {asset.realizedProfit ? formatCurrency(asset.realizedProfit, currency) : '-'}
                </td>
                <td class={signedClass(asset.totalProfit)} data-label="Total P/L">
                  {formatCurrency(asset.totalProfit, currency)}
                </td>
                <td class={signedClass(asset.roiPercent)} data-label="ROI">
                  {formatPercent(asset.roiPercent)}
                </td>
                <td data-label="Allocation">{formatPercent(asset.allocationPercent)}</td>
                <td
                  class={asset.allocationDriftPercent
                    ? signedClass(asset.allocationDriftPercent)
                    : 'neutral'}
                  data-label="Drift"
                >
                  {asset.allocationDriftPercent ? formatPercent(asset.allocationDriftPercent) : '-'}
                </td>
                <td data-label="Price">{formatCurrency(asset.currentPrice, currency)}</td>
                <td data-label="Status">
                  <span class="status {statusClass(asset.priceStatus)}">
                    {statusLabel(asset.priceStatus)}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="card data-health">
    <div class="section-head">
      <div class="section-title">
        <h2>Data health</h2>
        <span class="muted">Snapshot cadence and price freshness</span>
      </div>
      <span class="status {statusClass(data.health.status)}">{statusLabel(data.health.status)}</span
      >
    </div>
    <div class="health-grid">
      <article>
        <span class="muted">Hourly snapshots</span>
        <strong class={statusClass(data.health.snapshotHealth.hourly.status)}>
          {statusLabel(data.health.snapshotHealth.hourly.status)}
        </strong>
        <small>{data.health.snapshotHealth.hourly.message}</small>
      </article>
      <article>
        <span class="muted">Daily snapshots</span>
        <strong class={statusClass(data.health.snapshotHealth.daily.status)}>
          {statusLabel(data.health.snapshotHealth.daily.status)}
        </strong>
        <small>{data.health.snapshotHealth.daily.message}</small>
      </article>
      <article>
        <span class="muted">Price updates</span>
        <strong class={statusClass(data.health.priceHealth.status)}>
          {statusLabel(data.health.priceHealth.status)}
        </strong>
        <small
          >Latest success {formatDateTime(data.health.priceHealth.latestSuccessfulFetchAt)}</small
        >
      </article>
      <article>
        <span class="muted">Snapshot gaps</span>
        <strong>{data.health.gaps.length}</strong>
        <small>Large gaps affect range analytics</small>
      </article>
    </div>

    <div class="health-lists">
      <div>
        <h3>Price freshness</h3>
        {#if data.health.priceHealth.assets.length === 0}
          <p class="muted">No active assets require prices.</p>
        {:else}
          <div class="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Status</th>
                  <th>Latest price</th>
                  <th>Latest event</th>
                </tr>
              </thead>
              <tbody>
                {#each data.health.priceHealth.assets as asset}
                  <tr>
                    <td>{asset.assetSymbol}</td>
                    <td>
                      <span class="status {statusClass(asset.status)}"
                        >{statusLabel(asset.status)}</span
                      >
                    </td>
                    <td>{formatDateTime(asset.latestPriceAt)}</td>
                    <td>{asset.latestEventStatus ?? '-'} {formatDateTime(asset.latestEventAt)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
      <div>
        <h3>History gaps</h3>
        {#if data.health.gaps.length === 0}
          <p class="muted">No snapshot gaps detected.</p>
        {:else}
          <div class="gap-list">
            {#each data.health.gaps.slice(0, 6) as gap}
              <article>
                <strong>{gap.snapshotType}</strong>
                <span>{gap.gapHours}h</span>
                <small>{formatDateTime(gap.gapStart)} to {formatDateTime(gap.gapEnd)}</small>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </section>
</section>

<style>
  .analytics-page {
    display: grid;
    gap: 1rem;
  }

  .analytics-notice,
  .inline-notice {
    align-items: center;
    display: flex;
    gap: 0.55rem;
  }

  .analytics-metrics {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .analytics-main {
    margin-top: 0;
  }

  .section-head {
    align-items: center;
    display: flex;
    gap: 0.8rem;
    justify-content: space-between;
    margin-bottom: 0.8rem;
  }

  .section-title {
    display: grid;
    gap: 0.25rem;
  }

  .chart-head {
    align-items: flex-start;
  }

  .range-tabs {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    gap: 0.2rem;
    padding: 0.2rem;
  }

  .range-tabs button {
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--muted);
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 800;
    min-height: 2rem;
    min-width: 2.6rem;
    padding: 0 0.55rem;
  }

  .range-tabs button:hover,
  .range-tabs button.active {
    background: var(--surface-strong);
    color: var(--text);
  }

  .range-tabs button:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .health-pill,
  .status {
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 999px;
    display: inline-flex;
    font-size: 0.8rem;
    font-weight: 800;
    gap: 0.4rem;
    min-height: 1.8rem;
    padding: 0 0.65rem;
    width: max-content;
  }

  .health-pill {
    min-height: 2.35rem;
  }

  .healthy {
    color: var(--positive);
  }

  .warning {
    color: var(--amber);
  }

  .broken {
    color: var(--negative);
  }

  .status.healthy,
  .health-pill.healthy {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.28);
  }

  .status.warning,
  .health-pill.warning {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.3);
  }

  .status.broken,
  .health-pill.broken {
    background: rgba(251, 113, 133, 0.1);
    border-color: rgba(251, 113, 133, 0.3);
  }

  .partial-state {
    background: rgba(96, 165, 250, 0.1);
    border: 1px solid rgba(96, 165, 250, 0.25);
    border-radius: 8px;
    color: #bfdbfe;
    margin-bottom: 0.8rem;
    padding: 0.75rem;
  }

  .loading-state {
    align-items: center;
    color: var(--muted);
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    min-height: 280px;
  }

  .loading-state :global(svg) {
    animation: spin 0.9s linear infinite;
  }

  .allocation-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
  }

  .allocation-stats,
  .health-grid {
    display: grid;
    gap: 0.75rem;
  }

  .allocation-stats article,
  .health-grid article,
  .gap-list article {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: grid;
    gap: 0.28rem;
    padding: 0.85rem;
  }

  .allocation-stats strong,
  .health-grid strong {
    font-size: 1.3rem;
  }

  .health-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .health-grid small,
  .gap-list small {
    color: var(--subtle);
  }

  .health-lists {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 0.7fr);
    margin-top: 1rem;
  }

  .health-lists h3 {
    font-size: 0.95rem;
    margin: 0 0 0.65rem;
  }

  .compact-table table {
    min-width: 560px;
  }

  .gap-list {
    display: grid;
    gap: 0.65rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 1180px) {
    .analytics-metrics,
    .health-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 860px) {
    .analytics-metrics,
    .allocation-grid,
    .health-grid,
    .health-lists {
      grid-template-columns: 1fr;
    }

    .chart-head {
      display: grid;
    }

    .range-tabs {
      overflow-x: auto;
      width: 100%;
    }

    .range-tabs button {
      flex: 1 0 auto;
    }

    .health-pill {
      justify-self: start;
    }
  }
</style>
