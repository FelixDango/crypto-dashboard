<script lang="ts">
  import { AlertTriangle, CheckCircle2, CircleAlert, Info, ShieldCheck } from '@lucide/svelte';
  import CycleCard from '$lib/components/CycleCard.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import { formatPercent, signedClass } from '$lib/format';
  import type { AnalyticsAllocationResponse, AnalyticsSummary } from '$lib/analytics/types';
  import type { DataConfidence } from '$lib/server/insights/data-confidence';
  import type { ExplainRange, ExplainResult } from '$lib/server/insights/explain';
  import type { CycleProgress, CycleWindow } from '$lib/server/insights/market-cycle';

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
        <strong class={signedClass(data.summary.totalRoiPercent)}>
          {formatPercent(data.summary.totalRoiPercent)}
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

  @media (max-width: 980px) {
    .confidence-grid,
    .safe-grid,
    .timeline {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 680px) {
    .range-tabs,
    .confidence-grid,
    .safe-grid,
    .timeline {
      grid-template-columns: 1fr;
      width: 100%;
    }

    .range-tabs {
      display: flex;
    }
  }
</style>
