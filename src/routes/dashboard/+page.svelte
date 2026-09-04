<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    BarChart3,
    ChevronRight,
    Plus,
    RefreshCw,
    TriangleAlert,
    WalletCards
  } from '@lucide/svelte';
  import Decimal from 'decimal.js';
  import type { EChartsOption } from 'echarts';
  import Chart from '$lib/components/Chart.svelte';
  import CryptoIcon from '$lib/components/CryptoIcon.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import type { AnalyticsSummary } from '$lib/analytics/types';
  import { formatCurrency, formatDateTime, formatPercent, signedClass } from '$lib/format';
  import type { PortfolioOverview, SnapshotRange } from '$lib/types';
  import type { PortfolioPlanning } from '$lib/planning/types';

  export let data: {
    overview: PortfolioOverview;
    planning: PortfolioPlanning;
    analyticsSummary: AnalyticsSummary;
    snapshotRange: SnapshotRange;
    snapshotRanges: { value: SnapshotRange; label: string }[];
    resetResult: null | {
      scope: 'portfolio' | 'full';
      totalRows: number;
      deletedCategories: Array<{ label: string; count: number }>;
    };
  };

  let valueOption: EChartsOption;
  let refreshing = false;
  let refreshError = '';

  $: overview = data.overview;
  $: currency = overview.totals.baseCurrency;
  $: snapshotSeries = overview.portfolioSnapshotSeries;
  $: selectedRange = data.snapshotRange;
  $: selectedChange = data.analyticsSummary.changes[selectedRange];
  $: openHoldings = overview.holdings.filter((holding) => new Decimal(holding.quantity).gt(0));
  $: warnings = [
    ...overview.priceWarnings,
    ...overview.fxWarnings,
    ...(overview.dataHealthWarnings ?? [])
  ];
  $: alertMessages = [refreshError, ...warnings].filter((message): message is string =>
    Boolean(message)
  );
  $: latestPriceAt = openHoldings
    .map((holding) => holding.priceCapturedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  $: goalProgress = data.planning.goal?.progressPercentage;
  $: visibleRanges = data.snapshotRanges.filter(
    (range) => range.value !== '24h' || data.analyticsSummary.changes['24h'].available
  );
  $: chartSummary = `Portfolio value is ${formatCurrency(
    overview.totals.currentValue,
    currency
  )}. Total profit and loss is ${formatCurrency(overview.totals.totalProfit, currency)}.`;
  $: valueOption = {
    backgroundColor: 'transparent',
    grid: { left: 6, right: 66, top: 20, bottom: 28, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#182027',
      borderColor: '#36434d',
      textStyle: { color: '#f2f5f5' }
    },
    xAxis: {
      type: 'time',
      axisLabel: { color: '#77848d', hideOverlap: true },
      axisLine: { lineStyle: { color: '#263039' } },
      axisTick: { show: false },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      position: 'right',
      scale: true,
      splitNumber: 4,
      axisLabel: {
        color: '#77848d',
        formatter: (value: number) => compactCurrency(value, currency)
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#202a32', type: 'dashed' } }
    },
    series: [
      {
        type: 'line',
        smooth: 0.22,
        showSymbol: false,
        symbolSize: 7,
        areaStyle: { color: 'rgba(53, 214, 203, 0.10)' },
        lineStyle: { color: '#35d6cb', width: 2.5 },
        itemStyle: { color: '#35d6cb' },
        data: overview.portfolioSeries.map(
          (point) => [point.bucketAt, Number(point.value)] as [string, number]
        )
      }
    ]
  };

  function compactCurrency(value: number, targetCurrency: 'EUR' | 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: targetCurrency,
      notation: 'compact',
      maximumFractionDigits: 0
    }).format(value);
  }

  function rangeLabel(range: SnapshotRange): string {
    return (
      {
        '24h': '1D',
        '7d': '1W',
        '30d': '1M',
        '90d': '3M',
        '1y': '1Y',
        all: 'All'
      } satisfies Record<SnapshotRange, string>
    )[range];
  }

  function rangeCopy(range: SnapshotRange): string {
    return (
      {
        '24h': 'today',
        '7d': 'over 7 days',
        '30d': 'over 30 days',
        '90d': 'over 90 days',
        '1y': 'over 1 year',
        all: 'all time'
      } satisfies Record<SnapshotRange, string>
    )[range];
  }

  function signedCurrency(value: string): string {
    const formatted = formatCurrency(value, currency);
    return new Decimal(value).gt(0) ? `+${formatted}` : formatted;
  }

  function signedPercent(value: string): string {
    const formatted = formatPercent(value);
    return new Decimal(value).gt(0) ? `+${formatted}` : formatted;
  }

  function holdingHref(assetId: string): string {
    return `/assets/${encodeURIComponent(assetId)}`;
  }

  function hasValuation(holding: PortfolioOverview['holdings'][number]): boolean {
    return holding.priceStatus !== 'missing';
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

<section class="page portfolio-page">
  <div class="page-header portfolio-header">
    <h1>Portfolio</h1>
    {#if openHoldings.length > 0}
      <a class="btn primary add-transaction" href="/transactions?new=1">
        <Plus size={18} />
        Add transaction
      </a>
    {/if}
  </div>

  {#if data.resetResult}
    <div class="notice reset-result" data-testid="reset-success" role="status">
      <strong>Reset complete</strong>
      <span>{data.resetResult.totalRows} rows deleted.</span>
    </div>
  {/if}

  {#if alertMessages.length > 0}
    <div class="notice warning-list" role="status">
      <TriangleAlert size={18} />
      <div>
        <strong>Some values need attention</strong>
        {#each alertMessages.slice(0, 3) as message}
          <span>{message}</span>
        {/each}
      </div>
    </div>
  {/if}

  {#if openHoldings.length === 0}
    <section class="first-entry" aria-labelledby="first-entry-heading">
      <span class="empty-icon"><WalletCards size={24} /></span>
      <div class="first-entry-copy">
        <span class="eyebrow">Your private ledger is ready</span>
        <h2 id="first-entry-heading">Start with your first transaction</h2>
        <p>
          Add a manual buy or sell. Portfolio value, average cost, performance, and holdings will
          build from that single source of truth.
        </p>
        <a class="btn primary" href="/transactions?new=1">
          <Plus size={18} />
          Add your first transaction
        </a>
        <small>No exchange connection required.</small>
      </div>
      <div class="first-entry-outcomes" aria-label="What appears next">
        <div>
          <strong>Value and return</strong>
          <span>One clear portfolio summary instead of a wall of zero metrics.</span>
        </div>
        <div>
          <strong>Holdings</strong>
          <span>Current allocation and position-level returns at a glance.</span>
        </div>
        <div>
          <strong>History</strong>
          <span>A trend line grows automatically from local snapshots.</span>
        </div>
      </div>
    </section>
  {:else}
    <div class="portfolio-workspace">
      <section class="portfolio-overview" aria-labelledby="portfolio-value-heading">
        <div class="overview-topline">
          <span id="portfolio-value-heading">Net portfolio</span>
          <div class="price-status">
            <span class:attention={overview.totals.stalePriceCount > 0} class="status-dot"></span>
            <span>
              {#if openHoldings.length === 0}
                Ready when you are
              {:else if latestPriceAt}
                Updated {formatDateTime(latestPriceAt)}
              {:else}
                Price data pending
              {/if}
            </span>
            {#if openHoldings.length > 0}
              <button
                type="button"
                class="refresh-button"
                on:click={refreshPrices}
                disabled={refreshing}
                aria-label={refreshing ? 'Refreshing prices' : 'Refresh prices'}
                title={refreshing ? 'Refreshing prices' : 'Refresh prices'}
              >
                <RefreshCw size={17} class={refreshing ? 'spinning' : undefined} />
              </button>
            {/if}
          </div>
        </div>

        <PrivacyValue
          className="portfolio-value"
          value={formatCurrency(overview.totals.currentValue, currency)}
          kind="fiat"
        />

        <div class="period-change">
          {#if selectedChange.available && selectedChange.valueChange && selectedChange.percentChange}
            <strong class={signedClass(selectedChange.valueChange)}>
              <PrivacyValue value={signedCurrency(selectedChange.valueChange)} kind="fiat" />
              · {signedPercent(selectedChange.percentChange)}
            </strong>
            <span>{rangeCopy(selectedRange)}</span>
          {:else if openHoldings.length === 0}
            <span>Add your first transaction to begin.</span>
          {:else}
            <span>Performance change needs more snapshot history.</span>
          {/if}
        </div>

        {#if openHoldings.length > 0}
          <div class="summary-facts" aria-label="Portfolio summary">
            <div>
              <span>Total return</span>
              <strong
                class={overview.totals.roiPercent === null
                  ? 'muted'
                  : signedClass(overview.totals.totalProfit)}
              >
                <PrivacyValue value={signedCurrency(overview.totals.totalProfit)} kind="fiat" />
                {#if overview.totals.roiPercent !== null}
                  · {signedPercent(overview.totals.roiPercent)}
                {/if}
              </strong>
            </div>
            <div>
              <span>Cost basis</span>
              <PrivacyValue
                className="summary-value"
                value={formatCurrency(overview.totals.openCostBasis, currency)}
                kind="fiat"
              />
            </div>
            <a href="/plan" aria-label="Open portfolio goal">
              <span>Goal</span>
              <strong>
                {#if data.planning.plan && data.planning.goal && goalProgress != null}
                  {formatPercent(goalProgress)} · {formatCurrency(
                    data.planning.goal.targetValue,
                    data.planning.plan.currency
                  )}
                {:else}
                  Set target
                {/if}
              </strong>
            </a>
          </div>
        {/if}

        <div class="chart-controls">
          <nav class="range-tabs" aria-label="Portfolio range">
            {#each visibleRanges as range}
              <a
                class:active={selectedRange === range.value}
                href={`/dashboard?range=${range.value}`}
                aria-label={`${range.label} portfolio range`}
                aria-current={selectedRange === range.value ? 'page' : undefined}
              >
                {rangeLabel(range.value)}
              </a>
            {/each}
          </nav>
          <a class="details-link" href="/analytics">Details</a>
        </div>

        <div class="chart-region">
          {#if openHoldings.length === 0}
            <div class="empty-portfolio">
              <span class="empty-icon"><WalletCards size={24} /></span>
              <div>
                <h2>Start your portfolio</h2>
                <p>Your value, performance, and holdings will appear after your first entry.</p>
              </div>
            </div>
          {:else if !snapshotSeries.hasSnapshots || overview.portfolioSeries.length === 0}
            <div class="empty-portfolio">
              <span class="empty-icon"><BarChart3 size={24} /></span>
              <div>
                <h2>Your trend is getting ready</h2>
                <p>Portfolio history appears as automatic snapshots are collected.</p>
              </div>
            </div>
          {:else}
            <Chart
              option={valueOption}
              label="Portfolio value chart"
              summary={chartSummary}
              sensitive
            />
          {/if}
        </div>
      </section>

      <aside class="holdings-panel" aria-labelledby="holdings-heading">
        <div class="holdings-heading">
          <div>
            <h2 id="holdings-heading">Holdings</h2>
            <span>{openHoldings.length} {openHoldings.length === 1 ? 'asset' : 'assets'}</span>
          </div>
          {#if openHoldings.length > 0}
            <a href="/assets">Details</a>
          {/if}
        </div>

        {#if openHoldings.length === 0}
          <div class="holdings-empty">
            <span class="empty-icon"><WalletCards size={24} /></span>
            <h2>No assets yet</h2>
            <p>Assets appear here after your first transaction.</p>
          </div>
        {:else}
          <div class="holding-columns" aria-hidden="true">
            <span>Asset</span>
            <span>Value</span>
            <span>Return</span>
          </div>
          <div class="holding-list">
            {#each openHoldings as holding}
              <a class="holding-row" href={holdingHref(holding.assetId)}>
                <span class="asset-identity">
                  <CryptoIcon
                    src={holding.imageUrl}
                    symbol={holding.assetSymbol}
                    name={holding.assetName}
                    size={42}
                  />
                  <span>
                    <strong>{holding.assetName}</strong>
                    <small>{holding.assetSymbol}</small>
                  </span>
                </span>
                <span class="holding-value">
                  {#if hasValuation(holding)}
                    <PrivacyValue
                      value={formatCurrency(holding.currentValue, currency)}
                      kind="fiat"
                    />
                    <small>{formatPercent(holding.allocationPercent)}</small>
                  {:else}
                    <span class="muted">Price missing</span>
                  {/if}
                </span>
                <span class="holding-return">
                  <strong
                    class={holding.roiPercent === null ? 'muted' : signedClass(holding.roiPercent)}
                  >
                    {holding.roiPercent === null ? '–' : signedPercent(holding.roiPercent)}
                  </strong>
                  <ChevronRight size={17} />
                </span>
              </a>
            {/each}
          </div>
        {/if}
      </aside>
    </div>
  {/if}
</section>

<style>
  .portfolio-page {
    max-width: 1560px;
  }

  .portfolio-header {
    align-items: center;
    justify-content: flex-start;
    margin-bottom: 2.5rem;
  }

  .add-transaction {
    margin-left: 0.75rem;
  }

  .reset-result {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .warning-list {
    align-items: flex-start;
    display: flex;
    gap: 0.7rem;
    margin-bottom: 1.5rem;
  }

  .warning-list div {
    display: grid;
    gap: 0.25rem;
  }

  .warning-list span,
  .reset-result span {
    font-size: 0.84rem;
  }

  .first-entry {
    align-items: flex-start;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    display: grid;
    gap: 1.25rem 1.5rem;
    grid-template-columns: 3rem minmax(0, 36rem);
    max-width: 720px;
    padding: clamp(3rem, 8vw, 6.5rem) 0;
  }

  .first-entry-copy {
    display: grid;
    gap: 0.85rem;
  }

  .first-entry-copy .eyebrow {
    color: var(--accent);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .first-entry-copy h2 {
    font-size: clamp(1.8rem, 4vw, 3rem);
    letter-spacing: -0.045em;
    line-height: 1.05;
  }

  .first-entry-copy p {
    color: var(--muted);
    line-height: 1.65;
    max-width: 34rem;
  }

  .first-entry-copy .btn {
    justify-self: start;
    margin-top: 0.35rem;
  }

  .first-entry-copy small {
    color: var(--subtle);
  }

  .first-entry-outcomes {
    border-top: 1px solid var(--border);
    display: grid;
    gap: 1.25rem;
    grid-column: 2;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 1.5rem;
    padding-top: 1.5rem;
  }

  .first-entry-outcomes div {
    display: grid;
    gap: 0.4rem;
  }

  .first-entry-outcomes strong {
    font-size: 0.86rem;
  }

  .first-entry-outcomes span {
    color: var(--muted);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .portfolio-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(360px, 0.85fr);
    min-height: calc(100vh - 9.5rem);
  }

  .portfolio-overview {
    min-width: 0;
    padding-right: clamp(1.75rem, 3vw, 3.25rem);
  }

  .overview-topline {
    align-items: center;
    color: var(--muted);
    display: flex;
    font-size: 0.92rem;
    gap: 1rem;
    justify-content: space-between;
  }

  .price-status {
    align-items: center;
    color: var(--subtle);
    display: flex;
    font-size: 0.78rem;
    gap: 0.45rem;
  }

  .status-dot {
    background: var(--positive);
    border-radius: 50%;
    height: 0.45rem;
    width: 0.45rem;
  }

  .status-dot.attention {
    background: var(--amber);
  }

  .refresh-button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 50%;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    height: 2rem;
    justify-content: center;
    padding: 0;
    width: 2rem;
  }

  .refresh-button:hover {
    background: var(--surface-soft);
    color: var(--text);
  }

  :global(.spinning) {
    animation: spin 900ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  :global(.portfolio-value) {
    display: block;
    font-size: clamp(3.1rem, 5vw, 5.25rem);
    font-variant-numeric: tabular-nums;
    font-weight: 760;
    letter-spacing: -0.065em;
    line-height: 1;
    margin-top: 1rem;
  }

  .period-change {
    align-items: baseline;
    display: flex;
    gap: 0.55rem;
    margin-top: 1.05rem;
  }

  .period-change strong {
    font-size: 1.15rem;
    font-weight: 650;
  }

  .period-change span {
    color: var(--muted);
    font-size: 0.9rem;
  }

  .summary-facts {
    display: flex;
    margin-top: 2.45rem;
  }

  .summary-facts > div,
  .summary-facts > a {
    display: grid;
    gap: 0.45rem;
    min-width: 10.5rem;
    padding-right: 1.5rem;
  }

  .summary-facts > * + * {
    border-left: 1px solid var(--border);
    padding-left: 1.5rem;
  }

  .summary-facts > a:hover strong {
    color: var(--accent);
  }

  .summary-facts span {
    color: var(--muted);
    font-size: 0.82rem;
  }

  .summary-facts strong,
  :global(.summary-value) {
    font-size: 1.05rem;
    font-weight: 650;
  }

  .range-tabs {
    align-items: center;
    display: flex;
    gap: 0.35rem;
  }

  .chart-controls {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin-top: 2.7rem;
  }

  .details-link,
  .holdings-heading a {
    color: var(--accent);
    font-size: 0.82rem;
    font-weight: 650;
  }

  .range-tabs a {
    border-radius: var(--radius-sm);
    color: var(--muted);
    display: inline-flex;
    font-size: 0.85rem;
    justify-content: center;
    min-height: 2.45rem;
    min-width: 2.8rem;
    padding: 0 0.55rem;
  }

  .range-tabs a:hover,
  .range-tabs a.active {
    background: var(--surface-soft);
    color: var(--text);
  }

  .chart-region {
    min-height: 300px;
    padding-top: 0.5rem;
  }

  .chart-region :global(.chart) {
    min-height: 300px;
  }

  .empty-portfolio {
    align-items: center;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    color: var(--muted);
    display: flex;
    gap: 1rem;
    margin-top: 1.25rem;
    min-height: 220px;
    padding: 2rem;
  }

  .empty-portfolio div {
    display: grid;
    gap: 0.4rem;
  }

  .empty-portfolio h2 {
    color: var(--text);
  }

  .empty-portfolio p,
  .holdings-empty p {
    color: var(--muted);
    font-size: 0.9rem;
    line-height: 1.55;
    max-width: 28rem;
  }

  .empty-icon {
    align-items: center;
    background: var(--surface-soft);
    border-radius: 50%;
    color: var(--accent);
    display: inline-flex;
    flex: 0 0 auto;
    height: 3rem;
    justify-content: center;
    width: 3rem;
  }

  .holdings-heading,
  .holdings-heading > div {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }

  .holdings-heading a {
    align-items: center;
    color: var(--accent);
    display: inline-flex;
    font-size: 0.82rem;
    gap: 0.35rem;
  }

  .holdings-panel {
    border-left: 1px solid var(--border);
    min-width: 0;
    padding-left: clamp(1.75rem, 3vw, 3.25rem);
  }

  .holdings-heading {
    min-height: 2rem;
  }

  .holdings-heading > div {
    gap: 0.6rem;
  }

  .holdings-heading > div span {
    color: var(--subtle);
    font-size: 0.78rem;
  }

  .holding-columns,
  .holding-row {
    display: grid;
    grid-template-columns: minmax(140px, 1fr) minmax(105px, 0.72fr) minmax(90px, 0.55fr);
  }

  .holding-columns {
    border-bottom: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.74rem;
    margin-top: 1.4rem;
    padding: 0 0 0.8rem;
  }

  .holding-columns span:not(:first-child) {
    text-align: right;
  }

  .holding-row {
    align-items: center;
    border-bottom: 1px solid var(--border);
    gap: 0.75rem;
    min-height: 6rem;
    transition: background 120ms ease;
  }

  .holding-row:hover {
    background: rgba(255, 255, 255, 0.018);
  }

  .asset-identity {
    align-items: center;
    display: flex;
    gap: 0.75rem;
    min-width: 0;
  }

  .asset-identity > span,
  .holding-value {
    display: grid;
    gap: 0.28rem;
    min-width: 0;
  }

  .asset-identity strong {
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .asset-identity small,
  .holding-value small {
    color: var(--subtle);
    font-size: 0.75rem;
  }

  .holding-value,
  .holding-return {
    text-align: right;
  }

  .holding-return {
    align-items: center;
    display: flex;
    gap: 0.6rem;
    justify-content: flex-end;
  }

  .holding-return strong {
    font-size: 0.88rem;
    font-weight: 600;
  }

  .holding-return :global(svg) {
    color: var(--subtle);
    flex: 0 0 auto;
  }

  .holdings-empty {
    align-content: center;
    display: grid;
    gap: 0.65rem;
    justify-items: start;
    min-height: 24rem;
  }

  @media (max-width: 1200px) {
    .portfolio-workspace {
      grid-template-columns: minmax(0, 1.2fr) minmax(340px, 0.8fr);
    }

    .holding-columns,
    .holding-row {
      grid-template-columns: minmax(125px, 1fr) minmax(95px, 0.7fr) minmax(76px, 0.5fr);
    }
  }

  @media (max-width: 1040px) {
    .portfolio-workspace {
      grid-template-columns: 1fr;
    }

    .portfolio-overview {
      padding-right: 0;
    }

    .holdings-panel {
      border-left: 0;
      border-top: 1px solid var(--border);
      margin-top: 2rem;
      padding-left: 0;
      padding-top: 1.75rem;
    }

    .holdings-empty {
      min-height: 12rem;
    }
  }

  @media (max-width: 680px) {
    .portfolio-header {
      align-items: center;
      display: flex;
      margin-bottom: 2rem;
    }

    .first-entry {
      gap: 1rem;
      grid-template-columns: 3rem minmax(0, 1fr);
      padding: 2.75rem 0;
    }

    .first-entry-outcomes {
      grid-column: 1 / -1;
      grid-template-columns: 1fr;
    }

    .add-transaction {
      margin-left: auto;
      width: auto !important;
    }

    :global(.portfolio-value) {
      font-size: clamp(2.75rem, 14vw, 4rem);
    }

    .overview-topline {
      align-items: flex-start;
      display: grid;
    }

    .price-status {
      justify-self: start;
    }

    .period-change {
      align-items: flex-start;
      display: grid;
      gap: 0.25rem;
    }

    .summary-facts {
      margin-top: 2rem;
    }

    .summary-facts > div {
      min-width: 0;
      width: 50%;
    }

    .range-tabs {
      justify-content: space-between;
      margin-top: 2rem;
      overflow-x: auto;
    }

    .range-tabs a {
      min-width: 2.6rem;
    }

    .chart-region,
    .chart-region :global(.chart) {
      min-height: 240px;
    }

    .empty-portfolio {
      align-items: flex-start;
      min-height: 190px;
      padding: 1.25rem 0;
    }

    .holding-columns {
      display: none;
    }

    .holding-list {
      margin-top: 0.75rem;
    }

    .holding-row {
      grid-template-columns: minmax(0, 1fr) auto;
      min-height: 5.4rem;
    }

    .holding-value {
      display: none;
    }

    .holding-return {
      min-width: 5.5rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.spinning) {
      animation: none;
    }
  }
</style>
