<script lang="ts">
  import { CalendarClock } from '@lucide/svelte';
  import type { CycleProgress } from '$lib/server/insights/market-cycle';

  export let progress: CycleProgress | null;
  export let compact = false;

  $: phaseLabel = progress?.phase === 'bull' ? 'Bull' : 'Bear';
  $: progressValue = progress ? Math.min(100, Math.max(0, progress.progressPercent)) : 0;
</script>

<article class="card cycle-card" class:compact>
  <div class="cycle-head">
    <div>
      <span class="eyebrow">Custom cycle model</span>
      <h2>
        {#if progress}
          {phaseLabel} phase
        {:else}
          No active phase
        {/if}
      </h2>
    </div>
    <span
      class="phase"
      class:bull={progress?.phase === 'bull'}
      class:bear={progress?.phase === 'bear'}
    >
      <CalendarClock size={16} />
      {progress ? phaseLabel : 'Outside model'}
    </span>
  </div>

  {#if progress}
    <div class="cycle-range">
      <strong>{progress.phaseStart} -> {progress.visibleEndDate}</strong>
      <span>{progress.daysRemaining} days remaining</span>
    </div>
    <div class="progress-track" aria-label="Progress through phase">
      <span style={`width: ${progressValue}%`}></span>
    </div>
    <div class="cycle-meta">
      <span>{progress.progressPercent.toFixed(2)}% through phase</span>
      <span>{progress.nextTransition.label} {progress.nextTransition.date}</span>
    </div>
  {:else}
    <p class="muted">The current date is outside the configured custom cycle model.</p>
  {/if}

  <p class="cycle-note">Personal context only. Not a prediction or financial advice.</p>
</article>

<style>
  .cycle-card {
    display: grid;
    gap: 0.85rem;
  }

  .cycle-card.compact {
    min-height: 142px;
  }

  .cycle-head,
  .cycle-meta,
  .cycle-range {
    align-items: center;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
  }

  .eyebrow,
  .cycle-note,
  .cycle-meta,
  .cycle-range span {
    color: var(--muted);
    font-size: 0.82rem;
  }

  .phase {
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 999px;
    display: inline-flex;
    font-size: 0.8rem;
    font-weight: 800;
    gap: 0.35rem;
    min-height: 1.8rem;
    padding: 0 0.6rem;
  }

  .phase.bull {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.28);
    color: var(--positive);
  }

  .phase.bear {
    background: rgba(251, 113, 133, 0.1);
    border-color: rgba(251, 113, 133, 0.3);
    color: var(--negative);
  }

  .cycle-range strong {
    font-size: 1rem;
  }

  .progress-track {
    background: var(--surface-soft);
    border-radius: 999px;
    height: 0.55rem;
    overflow: hidden;
  }

  .progress-track span {
    background: linear-gradient(90deg, var(--accent), var(--blue));
    display: block;
    height: 100%;
  }

  @media (max-width: 680px) {
    .cycle-head,
    .cycle-meta,
    .cycle-range {
      align-items: flex-start;
      display: grid;
    }
  }
</style>
