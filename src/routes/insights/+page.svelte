<script lang="ts">
  import {
    AlertTriangle,
    CheckCircle2,
    CircleAlert,
    ExternalLink,
    Info,
    Newspaper,
    ShieldCheck
  } from '@lucide/svelte';
  import CycleCard from '$lib/components/CycleCard.svelte';
  import CryptoIcon from '$lib/components/CryptoIcon.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import {
    formatDate,
    formatDateTime,
    formatPercentagePoints,
    formatPercent,
    signedClass
  } from '$lib/format';
  import type { PlannedAssetMarketSignals } from '$lib/market-signals/types';
  import type { AnalyticsAllocationResponse, AnalyticsSummary } from '$lib/analytics/types';
  import type { DataConfidence } from '$lib/server/insights/data-confidence';
  import type { ExplainRange, ExplainResult } from '$lib/server/insights/explain';
  import type { CycleProgress, CycleWindow } from '$lib/server/insights/market-cycle';
  import type { PortfolioNewsContext } from '$lib/server/news/context';
  import type { NewsHealth } from '$lib/server/news/health';

  export let data: {
    range: ExplainRange;
    ranges: { value: ExplainRange; label: string }[];
    summary: AnalyticsSummary;
    allocation: AnalyticsAllocationResponse;
    confidence: DataConfidence;
    explain: {
      move: ExplainResult;
      dataHealth: ExplainResult;
      risk: ExplainResult;
      cycle: ExplainResult;
    };
    newsContext: PortfolioNewsContext;
    newsHealth: NewsHealth;
    marketSignals: PlannedAssetMarketSignals;
    cycle: CycleProgress | null;
    cycleWindows: CycleWindow[];
  };

  $: topIssues = data.confidence.issues.slice(0, 6);
  $: cyclePreview = data.cycleWindows.slice(0, 6);
  $: largest = data.allocation.concentration.largestPosition;

  function statusClass(status: string): string {
    if (status === 'healthy') return 'healthy';
    if (status === 'warning') return 'warning';
    return 'broken';
  }

  function statusLabel(status: string): string {
    return status.slice(0, 1).toUpperCase() + status.slice(1);
  }

  function signedPercent(value: number | null): string {
    if (value === null) return '-';
    return `${value > 0 ? '+' : ''}${formatPercent(value)}`;
  }
</script>

<section class="page insights-page">
  <div class="page-header">
    <div class="page-title">
      <h1>Insights</h1>
      <p class="muted">Deterministic portfolio context, data confidence, and custom cycle view.</p>
    </div>
    <div class="range-tabs" aria-label="Explain range">
      {#each data.ranges as range}
        <a
          class:active={data.range === range.value}
          href={`/insights?range=${range.value}`}
          aria-current={data.range === range.value ? 'page' : undefined}
        >
          {range.label}
        </a>
      {/each}
    </div>
  </div>

  <div class="grid two-column market-context-grid">
    <section class="card insight-card market-health-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Global market context</span>
          <h2>Crypto Fear &amp; Greed</h2>
        </div>
        <span class="status {data.marketSignals.health.sentimentFresh ? 'healthy' : 'warning'}">
          {data.marketSignals.health.sentimentFresh ? 'Fresh' : 'Pending or stale'}
        </span>
      </div>
      {#if data.marketSignals.sentiment}
        <div class="sentiment-reading">
          <strong>{data.marketSignals.sentiment.value}</strong>
          <span>{data.marketSignals.sentiment.classification}</span>
          <small>Observed {formatDate(data.marketSignals.sentiment.observedOn)}</small>
        </div>
      {:else}
        <p class="muted">Waiting for the scheduled sentiment refresh.</p>
      {/if}
      <a
        class="provider-link"
        href="https://alternative.me/crypto/fear-and-greed-index/"
        target="_blank"
        rel="noreferrer"
      >
        Alternative.me attribution <ExternalLink size={13} />
      </a>
      <div class="safe-grid signal-health-grid">
        <article>
          <span>Planned assets</span>
          <strong>{data.marketSignals.health.plannedAssetCount}</strong>
        </article>
        <article>
          <span>Fully scored</span>
          <strong>{data.marketSignals.health.fullyScoredAssetCount}</strong>
        </article>
        <article>
          <span>Candidates</span>
          <strong>{data.marketSignals.health.candidateCount}</strong>
        </article>
        <article>
          <span>Pending</span>
          <strong>{data.marketSignals.health.pendingAssetCount}</strong>
        </article>
      </div>
      {#if data.marketSignals.health.messages.length > 0}
        <ul class="issue-list">
          {#each data.marketSignals.health.messages as message}
            <li>{message}</li>
          {/each}
        </ul>
      {/if}
      <small class="muted">
        Last successful asset-history refresh:
        {formatDateTime(data.marketSignals.health.lastHistoryRefreshAt)}
      </small>
    </section>

    <section class="card insight-card signal-ranking-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Planned-asset ranking</span>
          <h2>Five-signal context</h2>
        </div>
        <a href="/plan">Open plan</a>
      </div>
      {#if data.marketSignals.assessments.length === 0}
        <p class="muted">Save allocation targets on the Plan page to populate this ranking.</p>
      {:else}
        <div class="insight-signal-list">
          {#each data.marketSignals.assessments as assessment, index}
            <article class:candidate={assessment.candidate}>
              <span class="rank">{index + 1}</span>
              <CryptoIcon
                src={assessment.imageUrl}
                symbol={assessment.symbol}
                name={assessment.name}
                size={30}
              />
              <div>
                <strong>{assessment.symbol}</strong>
                <small>
                  {assessment.favorableCount}/5 favorable ·
                  {assessment.underweight ? 'below target' : 'not below target'}
                </small>
              </div>
              <div class="ranking-meta">
                {#if assessment.candidateLabel}
                  <span class="candidate-label">{assessment.candidateLabel}</span>
                {:else if assessment.driftPercentagePoints !== null}
                  <span>{formatPercentagePoints(assessment.driftPercentagePoints)} drift</span>
                {:else}
                  <span>Drift unavailable</span>
                {/if}
                <small
                  >{assessment.historyAsOf
                    ? `Through ${formatDate(assessment.historyAsOf)}`
                    : 'History pending'}</small
                >
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <section class="card signal-methodology">
    <div class="section-head">
      <div>
        <span class="eyebrow">Methodology</span>
        <h2>Transparent thresholds and completed daily closes</h2>
      </div>
      <a
        class="provider-link"
        href="https://docs.coingecko.com/reference/coins-id-market-chart"
        target="_blank"
        rel="noreferrer">CoinGecko history <ExternalLink size={13} /></a
      >
    </div>
    <div class="method-grid">
      <article>
        <strong>Fear &amp; Greed</strong><span
          >Favorable ≤ {data.marketSignals.settings.fearGreedMax}</span
        >
      </article>
      <article>
        <strong>RSI (14)</strong><span
          >Wilder smoothing · favorable ≤ {data.marketSignals.settings.rsi14Max}</span
        >
      </article>
      <article>
        <strong>200-day SMA deviation</strong><span
          >(close / SMA200 − 1) × 100 · favorable ≤ {data.marketSignals.settings
            .sma200DeviationMax}%</span
        >
      </article>
      <article>
        <strong>365-day drawdown</strong><span
          >(close / 365-day high − 1) × 100 · favorable ≤ {data.marketSignals.settings
            .drawdown365Max}%</span
        >
      </article>
      <article>
        <strong>20-day Bollinger position</strong><span
          >(close − SMA20) / population standard deviation · favorable ≤ {data.marketSignals
            .settings.bollingerZMax}</span
        >
      </article>
    </div>
    <p class="muted small-note">
      A “Contribution candidate” needs complete portfolio valuation, a below-target allocation, all
      five fresh signals, and at least {data.marketSignals.settings.requiredFavorableCount} favorable
      signals. {data.marketSignals.methodologyDisclaimer}
    </p>
  </section>

  <div class="grid two-column">
    <section class="card insight-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">What changed?</span>
          <h2>{data.range} movement</h2>
        </div>
        <Info size={20} />
      </div>
      <p class="summary-line">
        <PrivacyValue value={data.explain.move.summary} kind="fiat" />
      </p>
      <ul class="clean-list">
        {#each data.explain.move.bullets as bullet}
          <li>{bullet}</li>
        {/each}
      </ul>
    </section>

    <section class="card confidence-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Data confidence</span>
          <h2>Can I trust the numbers?</h2>
        </div>
        <span class="status {statusClass(data.confidence.status)}">
          {#if data.confidence.status === 'healthy'}
            <CheckCircle2 size={16} />
          {:else if data.confidence.status === 'warning'}
            <CircleAlert size={16} />
          {:else}
            <AlertTriangle size={16} />
          {/if}
          {statusLabel(data.confidence.status)}
        </span>
      </div>
      <strong class="confidence-score">{data.confidence.score}%</strong>
      <div class="confidence-grid">
        {#each Object.entries(data.confidence.categories) as [name, category]}
          <article>
            <span>{statusLabel(name)}</span>
            <strong class={statusClass(category.status)}>{category.score}%</strong>
            <small>{statusLabel(category.status)}</small>
          </article>
        {/each}
      </div>
    </section>
  </div>

  <div class="grid two-column">
    <section class="card insight-card news-context-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Possible news context</span>
          <h2>Related headlines</h2>
        </div>
        <Newspaper size={20} />
      </div>
      {#if data.newsContext.assets.length === 0}
        <p class="muted">No recent related headlines matched held assets for {data.range}.</p>
      {:else}
        <div class="news-context-list">
          {#each data.newsContext.assets.slice(0, 4) as asset}
            <article>
              <div class="news-asset-head">
                <strong>{asset.symbol}</strong>
                <span class={signedClass(asset.priceChangePercent ?? 0)}>
                  {signedPercent(asset.priceChangePercent)}
                </span>
              </div>
              <p>{asset.contextSummary}</p>
              {#if asset.themes.length > 0}
                <div class="theme-row">
                  {#each asset.themes.slice(0, 4) as theme}
                    <span>{theme}</span>
                  {/each}
                </div>
              {/if}
              <ul>
                {#each asset.articles.slice(0, 5) as article}
                  <li>
                    <a href={article.url} target="_blank" rel="noreferrer">
                      {article.title}
                      <ExternalLink size={14} />
                    </a>
                    <small>{article.source}</small>
                  </li>
                {/each}
              </ul>
            </article>
          {/each}
        </div>
      {/if}
      <p class="muted small-note">{data.newsContext.disclaimer}</p>
    </section>

    <section class="card insight-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">News health</span>
          <h2>Optional context feed</h2>
        </div>
        <span class="status {statusClass(data.newsHealth.status)}">
          {#if data.newsHealth.status === 'healthy'}
            <CheckCircle2 size={16} />
          {:else if data.newsHealth.status === 'warning'}
            <CircleAlert size={16} />
          {:else}
            <AlertTriangle size={16} />
          {/if}
          {statusLabel(data.newsHealth.status)}
        </span>
      </div>
      <div class="safe-grid news-health-grid">
        <article>
          <span>Sources</span>
          <strong>{data.newsHealth.enabledSources}</strong>
        </article>
        <article>
          <span>Failed</span>
          <strong>{data.newsHealth.failedSources}</strong>
        </article>
        <article>
          <span>Fetched 24h</span>
          <strong>{data.newsHealth.articlesFetchedLast24h}</strong>
        </article>
        <article>
          <span>Matched 24h</span>
          <strong>{data.newsHealth.matchedArticlesLast24h}</strong>
        </article>
      </div>
      {#if data.newsHealth.messages.length > 0}
        <ul class="issue-list">
          {#each data.newsHealth.messages.slice(0, 4) as message}
            <li>{message}</li>
          {/each}
        </ul>
      {:else}
        <p class="muted">No news feed issues detected.</p>
      {/if}
    </section>
  </div>

  <div class="grid two-column">
    <CycleCard progress={data.cycle} />

    <section class="card insight-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Cycle timeline</span>
          <h2>Custom cycle model</h2>
        </div>
      </div>
      <div class="timeline">
        {#each cyclePreview as window}
          <article class={window.phase}>
            <span>{window.phase === 'bull' ? 'Bull' : 'Bear'}</span>
            <strong>{window.phaseStart} -> {window.visibleEndDate}</strong>
          </article>
        {/each}
      </div>
      <p class="muted small-note">
        Internal windows are half-open intervals: [start_date, end_date).
      </p>
    </section>
  </div>

  <div class="grid two-column">
    <section class="card insight-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Risk notes</span>
          <h2>{data.explain.risk.summary}</h2>
        </div>
      </div>
      {#if data.explain.risk.bullets.length === 0}
        <p class="muted">Risk notes appear after portfolio history exists.</p>
      {:else}
        <ul class="clean-list">
          {#each data.explain.risk.bullets as bullet}
            <li>{bullet}</li>
          {/each}
        </ul>
      {/if}
      {#each data.explain.risk.warnings as warning}
        <div class="notice inline-notice">
          <AlertTriangle size={16} />
          <span>{warning}</span>
        </div>
      {/each}
    </section>

    <section class="card insight-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Data issues</span>
          <h2>{data.explain.dataHealth.summary}</h2>
        </div>
      </div>
      {#if topIssues.length === 0}
        <p class="muted">No data issues detected.</p>
      {:else}
        <ul class="issue-list">
          {#each topIssues as issue}
            <li>{issue}</li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>

  <section class="card privacy-summary">
    <div class="section-head">
      <div>
        <span class="eyebrow">Privacy-safe summary</span>
        <h2>Percentages and status only</h2>
      </div>
      <ShieldCheck size={20} />
    </div>
    <div class="safe-grid">
      <article>
        <span>Total ROI</span>
        <strong
          class={data.summary.totalRoiPercent === null
            ? 'muted'
            : signedClass(data.summary.totalRoiPercent)}
        >
          {data.summary.totalRoiPercent === null
            ? '–'
            : formatPercent(data.summary.totalRoiPercent)}
        </strong>
      </article>
      <article>
        <span>Data confidence</span>
        <strong>{data.confidence.score}%</strong>
      </article>
      <article>
        <span>Cycle phase</span>
        <strong>{data.cycle ? statusLabel(data.cycle.phase) : '-'}</strong>
      </article>
      <article>
        <span>Largest allocation</span>
        <strong>{largest ? formatPercent(largest.allocationPercent) : '-'}</strong>
      </article>
    </div>
  </section>
</section>

<style>
  .insights-page {
    display: grid;
    gap: 1rem;
  }

  .range-tabs {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    gap: 0.2rem;
    padding: 0.2rem;
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

  .insight-card,
  .confidence-card,
  .privacy-summary {
    display: grid;
    gap: 0.85rem;
  }

  .section-head {
    align-items: center;
    display: flex;
    gap: 0.8rem;
    justify-content: space-between;
  }

  .eyebrow,
  .small-note {
    color: var(--muted);
    font-size: 0.82rem;
  }

  .summary-line {
    font-size: 1.1rem;
    font-weight: 800;
  }

  .clean-list,
  .issue-list {
    display: grid;
    gap: 0.55rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .clean-list li,
  .issue-list li {
    color: var(--muted);
    line-height: 1.45;
  }

  .issue-list li {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.24);
    border-radius: 8px;
    color: #f8d891;
    padding: 0.65rem;
  }

  .status {
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 999px;
    display: inline-flex;
    font-size: 0.8rem;
    font-weight: 800;
    gap: 0.35rem;
    min-height: 1.8rem;
    padding: 0 0.65rem;
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

  .status.healthy {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.28);
  }

  .status.warning {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.3);
  }

  .status.broken {
    background: rgba(251, 113, 133, 0.1);
    border-color: rgba(251, 113, 133, 0.3);
  }

  .confidence-score {
    font-size: clamp(2rem, 4vw, 3rem);
    line-height: 1;
  }

  .confidence-grid,
  .safe-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .confidence-grid article,
  .safe-grid article,
  .timeline article {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: grid;
    gap: 0.25rem;
    padding: 0.8rem;
  }

  .confidence-grid span,
  .safe-grid span,
  .timeline span {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .confidence-grid small {
    color: var(--subtle);
  }

  .timeline {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .timeline .bull {
    border-color: rgba(34, 197, 94, 0.28);
  }

  .timeline .bear {
    border-color: rgba(251, 113, 133, 0.3);
  }

  .inline-notice {
    align-items: center;
    display: flex;
    gap: 0.55rem;
  }

  .news-context-list {
    display: grid;
    gap: 0.75rem;
  }

  .news-context-list article {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: grid;
    gap: 0.55rem;
    padding: 0.8rem;
  }

  .news-asset-head,
  .theme-row,
  .news-context-list a {
    align-items: center;
    display: flex;
  }

  .news-asset-head {
    justify-content: space-between;
  }

  .news-context-list p {
    color: var(--muted);
    line-height: 1.45;
  }

  .theme-row {
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .theme-row span {
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 800;
    padding: 0.16rem 0.48rem;
  }

  .news-context-list ul {
    display: grid;
    gap: 0.45rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .news-context-list li {
    display: grid;
    gap: 0.15rem;
  }

  .news-context-list a {
    gap: 0.3rem;
    line-height: 1.35;
  }

  .news-context-list a:hover {
    color: var(--accent);
  }

  .news-context-list small {
    color: var(--muted);
  }

  .news-health-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .market-health-card,
  .signal-ranking-card,
  .signal-methodology {
    display: grid;
    gap: 0.85rem;
  }

  .sentiment-reading {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .sentiment-reading strong {
    color: var(--accent);
    font-size: 2.25rem;
    line-height: 1;
  }

  .sentiment-reading span {
    font-weight: 800;
  }

  .sentiment-reading small {
    color: var(--muted);
    flex-basis: 100%;
  }

  .provider-link,
  .signal-ranking-card .section-head a {
    align-items: center;
    color: var(--accent);
    display: inline-flex;
    font-size: 0.8rem;
    font-weight: 800;
    gap: 0.25rem;
  }

  .signal-health-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .insight-signal-list {
    display: grid;
    gap: 0.55rem;
  }

  .insight-signal-list > article {
    align-items: center;
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: grid;
    gap: 0.55rem;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    padding: 0.65rem;
  }

  .insight-signal-list > article.candidate {
    border-color: rgba(34, 197, 94, 0.34);
  }

  .rank {
    color: var(--subtle);
    font-size: 0.75rem;
    font-weight: 800;
    width: 1rem;
  }

  .insight-signal-list article > div:not(.ranking-meta),
  .ranking-meta {
    display: grid;
    gap: 0.15rem;
  }

  .insight-signal-list small,
  .ranking-meta span {
    color: var(--muted);
    font-size: 0.75rem;
  }

  .ranking-meta {
    justify-items: end;
    text-align: right;
  }

  .candidate-label {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.32);
    border-radius: 999px;
    color: var(--positive) !important;
    font-weight: 800;
    padding: 0.2rem 0.45rem;
  }

  .method-grid {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .method-grid article {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: grid;
    gap: 0.35rem;
    padding: 0.75rem;
  }

  .method-grid span {
    color: var(--muted);
    font-size: 0.76rem;
    line-height: 1.4;
  }

  @media (max-width: 980px) {
    .confidence-grid,
    .safe-grid,
    .method-grid,
    .timeline {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 680px) {
    .range-tabs,
    .confidence-grid,
    .safe-grid,
    .method-grid,
    .timeline {
      grid-template-columns: 1fr;
      width: 100%;
    }

    .range-tabs {
      display: flex;
    }

    .insight-signal-list > article {
      grid-template-columns: auto auto minmax(0, 1fr);
    }

    .ranking-meta {
      grid-column: 2 / -1;
      justify-items: start;
      text-align: left;
    }
  }
</style>
