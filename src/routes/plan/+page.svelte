<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import Decimal from 'decimal.js';
  import {
    Calculator,
    CalendarDays,
    CheckCircle2,
    Pencil,
    Plus,
    RefreshCw,
    SlidersHorizontal,
    Target,
    Trash2,
    TriangleAlert,
    X
  } from '@lucide/svelte';
  import AssetSearch from '$lib/components/AssetSearch.svelte';
  import CryptoIcon from '$lib/components/CryptoIcon.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import {
    formatCurrency,
    formatDate,
    formatDateTime,
    formatPercentagePoints,
    formatPercent
  } from '$lib/format';
  import type { PlannedAssetMarketSignals, SignalDatum } from '$lib/market-signals/types';
  import type {
    ContributionScenario,
    PortfolioPlanDraft,
    PortfolioPlanning
  } from '$lib/planning/types';

  type EditorRow = {
    key: number;
    provider: string;
    providerCoinId: string;
    symbol: string;
    name: string;
    imageUrl: string | null;
    targetPercentage: string;
  };

  type AssetChoice = Omit<EditorRow, 'key' | 'targetPercentage'> & { id: string };

  export let data: {
    planning: PortfolioPlanning;
    marketSignals: PlannedAssetMarketSignals;
    baseCurrency: 'EUR' | 'USD';
  };
  export let form: {
    error?: string;
    success?: boolean;
    intent?: 'save' | 'clear' | 'scenario' | 'refreshSignals';
    draft?: PortfolioPlanDraft;
    contribution?: string;
    scenario?: ContributionScenario;
    refreshedAssetId?: string;
    sentimentWarning?: string | null;
  } | null = null;

  let nextRowKey = 1;
  let showEditor = form?.intent === 'save' && Boolean(form.error);
  let showClear = false;
  let submittingIntent: string | null = null;
  let planName = form?.draft?.name ?? data.planning.plan?.name ?? '';
  let targetValue = form?.draft?.targetValue ?? data.planning.plan?.targetValue ?? '';
  let targetDate = form?.draft?.targetDate ?? data.planning.plan?.targetDate ?? '';
  let targetRows = createInitialRows(form?.draft);
  let contribution = form?.contribution ?? '';

  $: planning = data.planning;
  $: marketSignals = data.marketSignals;
  $: currency = planning.plan?.currency ?? data.baseCurrency;
  $: targetTotal = calculateTargetTotal(targetRows);
  $: validTargetRows = targetRows.every(
    (row) => row.providerCoinId && positiveDecimal(row.targetPercentage)
  );
  $: canSave =
    planName.trim().length > 0 &&
    positiveDecimal(targetValue) &&
    targetRows.length > 0 &&
    targetRows.length <= 50 &&
    validTargetRows &&
    targetTotal.eq(100);
  $: progressWidth = planning.goal?.progressPercentage
    ? Decimal.min(100, Decimal.max(0, new Decimal(planning.goal.progressPercentage))).toString()
    : '0';
  $: progressValue = Number(progressWidth);
  $: saveError = form?.intent === 'save' ? form.error : null;
  $: clearError = form?.intent === 'clear' ? form.error : null;
  $: scenarioError = form?.intent === 'scenario' ? form.error : null;
  $: scenario = form?.intent === 'scenario' ? form.scenario : null;
  $: signalRefreshError = form?.intent === 'refreshSignals' ? form.error : null;

  function createInitialRows(draft?: PortfolioPlanDraft): EditorRow[] {
    const targets =
      draft?.targets ??
      data.planning.plan?.targets.map((target) => ({
        provider: target.provider,
        providerCoinId: target.providerCoinId,
        symbol: target.symbol,
        name: target.name,
        imageUrl: target.imageUrl,
        targetPercentage: target.targetPercentage
      })) ??
      [];
    const rows = targets.map((target) => ({ ...target, key: nextRowKey++ }));
    return rows.length > 0 ? rows : [blankRow()];
  }

  function blankRow(): EditorRow {
    return {
      key: nextRowKey++,
      provider: 'coingecko',
      providerCoinId: '',
      symbol: '',
      name: '',
      imageUrl: null,
      targetPercentage: ''
    };
  }

  function positiveDecimal(value: string): boolean {
    try {
      return new Decimal(value).isFinite() && new Decimal(value).gt(0);
    } catch {
      return false;
    }
  }

  function calculateTargetTotal(rows: EditorRow[]): Decimal {
    return rows.reduce((sum, row) => {
      try {
        const value = new Decimal(row.targetPercentage || 0);
        return value.isFinite() ? sum.plus(value) : sum;
      } catch {
        return sum;
      }
    }, new Decimal(0));
  }

  function openEditor() {
    if (form?.intent === 'save') form = null;
    planName = planning.plan?.name ?? '';
    targetValue = planning.plan?.targetValue ?? '';
    targetDate = planning.plan?.targetDate ?? '';
    targetRows = createInitialRows();
    showEditor = true;
  }

  function selectTarget(key: number, asset: AssetChoice) {
    targetRows = targetRows.map((row) =>
      row.key === key
        ? {
            ...row,
            provider: asset.provider,
            providerCoinId: asset.providerCoinId,
            symbol: asset.symbol,
            name: asset.name,
            imageUrl: asset.imageUrl
          }
        : row
    );
  }

  function addTarget() {
    if (targetRows.length >= 50) return;
    targetRows = [...targetRows, blankRow()];
  }

  function removeTarget(key: number) {
    targetRows = targetRows.filter((row) => row.key !== key);
  }

  function submitAction(intent: string, close?: () => void): SubmitFunction {
    return () => {
      submittingIntent = intent;
      return async ({ result, update }) => {
        try {
          await update({ reset: false });
          if (result.type === 'success') close?.();
        } finally {
          submittingIntent = null;
        }
      };
    };
  }

  function driftClass(value: string | null): 'positive' | 'negative' | 'neutral' {
    if (value === null) return 'neutral';
    const decimal = new Decimal(value);
    return decimal.gt(0) ? 'positive' : decimal.lt(0) ? 'negative' : 'neutral';
  }

  function deadlineLabel() {
    const deadline = planning.deadline;
    if (deadline.state === 'none') return 'No target date';
    if (deadline.state === 'today') return 'Target date is today';
    if (deadline.state === 'passed') {
      return `${deadline.days} day${deadline.days === 1 ? '' : 's'} past target date`;
    }
    return `${deadline.days} day${deadline.days === 1 ? '' : 's'} remaining`;
  }

  function signalValue(signal: SignalDatum): string {
    if (signal.value === null) return 'Unavailable';
    const value = new Decimal(signal.value).toDecimalPlaces(2).toString();
    return signal.unit === 'percent' ? `${value}%` : value;
  }

  function thresholdValue(signal: SignalDatum): string {
    return `${signal.unit === 'percent' ? `${signal.threshold}%` : signal.threshold} or lower`;
  }
</script>

<svelte:head>
  <title>Portfolio Planning</title>
</svelte:head>

<section class="page planning-page">
  <div class="page-header">
    <div class="page-title">
      <h1>Portfolio Planning</h1>
      <p class="muted">Measure progress and explore alignment with your saved targets.</p>
    </div>
    {#if planning.plan}
      <div class="toolbar">
        <button class="btn" type="button" on:click={openEditor}>
          <Pencil size={18} />
          Edit plan
        </button>
        <button class="btn danger" type="button" on:click={() => (showClear = true)}>
          <Trash2 size={18} />
          Clear plan
        </button>
      </div>
    {/if}
  </div>

  {#if !planning.plan || !planning.goal}
    <section class="card empty-state plan-empty">
      <span class="empty-icon"><Target size={28} /></span>
      <div>
        <h2>No active portfolio plan</h2>
        <p class="muted">
          Add one value goal and your own asset targets. Planning remains informational and never
          changes transactions.
        </p>
      </div>
      <button class="btn primary" type="button" on:click={openEditor}>
        <Plus size={18} />
        Create plan
      </button>
    </section>
  {:else}
    <section class="card plan-hero">
      <div class="hero-title">
        <div>
          <span class="eyebrow">Active plan</span>
          <h2>{planning.plan.name}</h2>
        </div>
        <div class="target-value">
          <span class="muted">Target value</span>
          <PrivacyValue
            value={formatCurrency(planning.goal.targetValue, currency)}
            kind="fiat"
            className="target-amount"
          />
        </div>
      </div>

      <div
        class="progress-track"
        role="progressbar"
        aria-label="Goal progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={progressValue}
        aria-valuetext={planning.goal.progressPercentage === null
          ? 'Unavailable'
          : formatPercent(planning.goal.progressPercentage)}
      >
        <span style={`width: ${progressWidth}%`}></span>
      </div>

      <div class="hero-metrics">
        <div>
          <span class="metric-label">Progress</span>
          {#if planning.goal.progressPercentage !== null}
            <strong>{formatPercent(planning.goal.progressPercentage)}</strong>
            <PrivacyValue
              value={formatCurrency(planning.goal.currentValue ?? '0', currency)}
              kind="fiat"
              className="metric-note"
            />
          {:else}
            <strong>Unavailable</strong>
            <span class="metric-note">Portfolio total is partial</span>
          {/if}
        </div>
        <div>
          <span class="metric-label">Remaining value</span>
          {#if planning.goal.remainingValue !== null}
            <PrivacyValue
              value={formatCurrency(planning.goal.remainingValue, currency)}
              kind="fiat"
              className="metric-strong"
            />
            <span class="metric-note">Can reach zero; progress may exceed 100%</span>
          {:else}
            <strong>Unavailable</strong>
            <span class="metric-note">Waiting for complete totals</span>
          {/if}
        </div>
        <div>
          <span class="metric-label">Deadline</span>
          <strong class:negative={planning.deadline.state === 'passed'}>{deadlineLabel()}</strong>
          <span class="metric-note">
            {planning.deadline.targetDate ? formatDate(planning.deadline.targetDate) : 'Optional'}
          </span>
        </div>
        <div>
          <span class="metric-label">Data completeness</span>
          <strong
            class:positive={planning.completeness.complete}
            class:negative={!planning.completeness.complete}
          >
            {planning.completeness.complete ? 'Complete' : 'Partial'}
          </strong>
          <span class="metric-note">
            {planning.completeness.complete
              ? 'Goal and drift are available'
              : 'Goal and drift are paused'}
          </span>
        </div>
        <div>
          <span class="metric-label">Largest allocation drift</span>
          {#if planning.largestDrift}
            <strong class={driftClass(planning.largestDrift.driftPercentagePoints)}>
              {planning.largestDrift.symbol} · {formatPercentagePoints(
                planning.largestDrift.driftPercentagePoints
              )}
            </strong>
            <span class="metric-note">
              {formatPercentagePoints(planning.largestDrift.absoluteDriftPercentagePoints)} absolute
            </span>
          {:else}
            <strong>Unavailable</strong>
            <span class="metric-note">Requires complete portfolio totals</span>
          {/if}
        </div>
      </div>
    </section>

    {#if !planning.completeness.complete}
      <div class="notice completeness-notice" role="status">
        <TriangleAlert size={18} />
        <div>
          <strong>Partial portfolio data</strong>
          {#each planning.completeness.recoveryMessages as message}
            <span>{message}</span>
          {/each}
          <span
            >Goal progress, allocation drift, value gaps, and contribution scenarios stay
            unavailable until recovery.</span
          >
        </div>
      </div>
    {:else if !planning.hasTransactions}
      <div class="notice neutral-notice" role="status">
        <CheckCircle2 size={18} />
        <span
          >No transactions yet. Current values are zero and scenarios follow the saved target
          percentages.</span
        >
      </div>
    {/if}

    <section class="card allocation-section">
      <div class="section-head">
        <div>
          <h2>Allocation targets</h2>
          <p class="muted">Drift is current allocation minus target allocation.</p>
        </div>
        <span class="muted">{planning.allocationRows.length} assets</span>
      </div>

      <div class="table-wrap mobile-cards">
        <table class="mobile-card-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Current value</th>
              <th>Current allocation</th>
              <th>Target</th>
              <th>Drift</th>
              <th>Value gap</th>
            </tr>
          </thead>
          <tbody>
            {#each planning.allocationRows as row}
              <tr>
                <td class="primary-cell" data-label="Asset">
                  <span class="asset-cell">
                    <CryptoIcon src={row.imageUrl} symbol={row.symbol} name={row.name} size={32} />
                    <span>
                      <strong>{row.symbol}</strong>
                      <small>{row.name}{row.targeted ? '' : ' · no saved target'}</small>
                    </span>
                  </span>
                </td>
                <td data-label="Current value">
                  {#if row.currentValue !== null}
                    <PrivacyValue value={formatCurrency(row.currentValue, currency)} kind="fiat" />
                  {:else}
                    <span class="unavailable">Missing price</span>
                  {/if}
                </td>
                <td data-label="Current allocation">
                  {row.currentAllocationPercentage === null
                    ? 'Unavailable'
                    : formatPercent(row.currentAllocationPercentage)}
                </td>
                <td data-label="Target">{formatPercent(row.targetPercentage)}</td>
                <td data-label="Drift" class={driftClass(row.driftPercentagePoints)}>
                  {row.driftPercentagePoints === null
                    ? 'Unavailable'
                    : formatPercentagePoints(row.driftPercentagePoints)}
                </td>
                <td data-label="Value gap" class={driftClass(row.fiatValueGap)}>
                  {#if row.fiatValueGap === null}
                    Unavailable
                  {:else}
                    <PrivacyValue value={formatCurrency(row.fiatValueGap, currency)} kind="fiat" />
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="section-foot muted">
        Positive value gaps are below the saved target at the current portfolio value. Holdings
        without a target are listed with a 0% target.
      </p>
    </section>

    <section class="card market-signals-section">
      <div class="section-head">
        <div>
          <span class="section-icon"><SlidersHorizontal size={18} /></span>
          <h2>Planned-asset market context</h2>
          <p class="muted">
            Deterministic ranking from five completed-daily-data signals. Candidates appear only for
            underweight targets with all signals fresh and at least
            {marketSignals.settings.requiredFavorableCount} favorable.
          </p>
        </div>
        <a class="btn" href="/settings">Edit thresholds</a>
      </div>

      <div class="signal-health-row">
        <span class="signal-pill"
          >{marketSignals.health.fullyScoredAssetCount}/{marketSignals.health.plannedAssetCount} fully
          scored</span
        >
        <span class="signal-pill">{marketSignals.health.candidateCount} candidates</span>
        <span class:positive={marketSignals.health.sentimentFresh} class="signal-pill">
          Sentiment {marketSignals.health.sentimentFresh ? 'fresh' : 'pending or stale'}
        </span>
      </div>

      <div class="sentiment-context">
        <div>
          <span class="metric-label">Bitcoin-wide Crypto Fear &amp; Greed</span>
          {#if marketSignals.sentiment}
            <strong
              >{marketSignals.sentiment.value} · {marketSignals.sentiment.classification}</strong
            >
            <small>
              Observed {formatDate(marketSignals.sentiment.observedOn)} ·
              {marketSignals.health.sentimentFresh ? 'fresh' : 'stale'}
            </small>
          {:else}
            <strong>Waiting for first refresh</strong>
          {/if}
        </div>
        <a
          href="https://alternative.me/crypto/fear-and-greed-index/"
          target="_blank"
          rel="noreferrer">Alternative.me attribution</a
        >
      </div>

      {#if signalRefreshError}
        <div class="notice" role="alert">{signalRefreshError}</div>
      {:else if form?.intent === 'refreshSignals' && form.success}
        <div class="notice signal-success" role="status">
          Market history refreshed.{form.sentimentWarning ? ` ${form.sentimentWarning}` : ''}
        </div>
      {/if}

      {#if marketSignals.assessments.length === 0}
        <p class="muted">Save allocation targets to begin collecting market context.</p>
      {:else}
        <div class="signal-asset-list">
          {#each marketSignals.assessments as assessment}
            <article class:candidate={assessment.candidate} class="signal-asset-card">
              <div class="signal-asset-head">
                <div class="asset-cell">
                  <CryptoIcon
                    src={assessment.imageUrl}
                    symbol={assessment.symbol}
                    name={assessment.name}
                    size={34}
                  />
                  <span>
                    <strong>{assessment.symbol}</strong>
                    <small>{assessment.name}</small>
                  </span>
                </div>
                <div class="signal-asset-labels">
                  {#if assessment.candidateLabel}
                    <span class="candidate-label">{assessment.candidateLabel}</span>
                  {/if}
                  <span class="signal-pill">{assessment.favorableCount}/5 favorable</span>
                </div>
              </div>

              <div class="signal-summary-grid">
                <span>
                  <small>Allocation</small>
                  <strong class:negative={assessment.underweight}>
                    {assessment.underweight ? 'Below target' : 'Not below target'}
                  </strong>
                </span>
                <span>
                  <small>Drift</small>
                  <strong class={driftClass(assessment.driftPercentagePoints)}>
                    {assessment.driftPercentagePoints === null
                      ? 'Unavailable'
                      : formatPercentagePoints(assessment.driftPercentagePoints)}
                  </strong>
                </span>
                <span>
                  <small>History through</small>
                  <strong
                    >{assessment.historyAsOf
                      ? formatDate(assessment.historyAsOf)
                      : 'Pending'}</strong
                  >
                </span>
                <span>
                  <small>Last refresh</small>
                  <strong>{formatDateTime(assessment.lastRefreshAt)}</strong>
                </span>
              </div>

              <div class="signal-actions">
                <details>
                  <summary>Show five signal explanations</summary>
                  <div class="signal-detail-list">
                    {#each assessment.signals as signal}
                      <article class="signal-detail">
                        <div>
                          <strong>{signal.label}</strong>
                          {#if signal.key === 'fear_greed'}
                            <a
                              href="https://alternative.me/crypto/fear-and-greed-index/"
                              target="_blank"
                              rel="noreferrer">Alternative.me</a
                            >
                          {/if}
                        </div>
                        <span class="signal-state {signal.state}">{signal.state}</span>
                        <p>{signal.explanation}</p>
                        <small>
                          Value: {signalValue(signal)} · favorable at {thresholdValue(signal)} · as of
                          {signal.asOf ? formatDate(signal.asOf) : 'unavailable'}
                        </small>
                        {#if signal.unavailableReason}
                          <small class="signal-reason">{signal.unavailableReason}</small>
                        {/if}
                      </article>
                    {/each}
                  </div>
                </details>
                <form
                  method="POST"
                  action="?/refreshSignals"
                  use:enhance={submitAction(`refresh:${assessment.assetId}`)}
                >
                  <input type="hidden" name="asset_id" value={assessment.assetId} />
                  <button
                    class="btn"
                    type="submit"
                    disabled={submittingIntent === `refresh:${assessment.assetId}`}
                    aria-busy={submittingIntent === `refresh:${assessment.assetId}`}
                  >
                    <RefreshCw size={16} />
                    {submittingIntent === `refresh:${assessment.assetId}`
                      ? 'Refreshing…'
                      : 'Refresh'}
                  </button>
                </form>
              </div>

              {#if !assessment.candidate && assessment.reasons.length > 0}
                <div class="suppression-reasons">
                  <strong>Candidate label suppressed</strong>
                  <ul>
                    {#each assessment.reasons as reason}
                      <li>{reason}</li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </article>
          {/each}
        </div>
      {/if}

      <p class="disclaimer">
        {marketSignals.methodologyDisclaimer} Daily price history and volume are supplied by
        <a
          href="https://docs.coingecko.com/reference/coins-id-market-chart"
          target="_blank"
          rel="noreferrer">CoinGecko</a
        >. This section never calculates quantities, creates transactions, or places orders.
      </p>
    </section>

    <section class="card scenario-section">
      <div class="section-head">
        <div>
          <span class="section-icon"><Calculator size={18} /></span>
          <h2>Contribution alignment scenario</h2>
          <p class="muted">
            A mathematical distribution across positive target deficits only. It does not create
            transactions or model asset quantities.
          </p>
        </div>
      </div>

      <form
        method="POST"
        action="?/scenario"
        use:enhance={submitAction('scenario')}
        class="scenario-form"
      >
        <label class="field">
          <span class="field-label">Hypothetical contribution ({currency})</span>
          <input
            name="contribution"
            type="text"
            inputmode="decimal"
            bind:value={contribution}
            placeholder="1000"
            disabled={!planning.completeness.complete}
            required
          />
        </label>
        <button
          class="btn primary"
          type="submit"
          disabled={!planning.completeness.complete || submittingIntent === 'scenario'}
          aria-busy={submittingIntent === 'scenario'}
        >
          <Calculator size={18} />
          {submittingIntent === 'scenario' ? 'Calculating…' : 'Run scenario'}
        </button>
      </form>

      {#if scenarioError}
        <div class="notice scenario-notice" role="alert">{scenarioError}</div>
      {/if}

      {#if scenario}
        <div class="scenario-summary">
          <span>
            Contribution
            <PrivacyValue value={formatCurrency(scenario.contribution, currency)} kind="fiat" />
          </span>
          <span>
            Projected total
            <PrivacyValue
              value={formatCurrency(scenario.projectedPortfolioValue, currency)}
              kind="fiat"
            />
          </span>
          <span>
            Fully distributed
            <PrivacyValue value={formatCurrency(scenario.distributedTotal, currency)} kind="fiat" />
          </span>
        </div>
        <div class="table-wrap mobile-cards scenario-table">
          <table class="mobile-card-table">
            <thead>
              <tr>
                <th>Target asset</th>
                <th>Hypothetical amount</th>
                <th>Projected allocation</th>
                <th>Remaining drift</th>
              </tr>
            </thead>
            <tbody>
              {#each scenario.rows as row}
                <tr>
                  <td class="primary-cell" data-label="Target asset">
                    <span class="asset-cell">
                      <CryptoIcon
                        src={row.imageUrl}
                        symbol={row.symbol}
                        name={row.name}
                        size={28}
                      />
                      <span
                        ><strong>{row.symbol}</strong><small
                          >{formatPercent(row.targetPercentage)} target</small
                        ></span
                      >
                    </span>
                  </td>
                  <td data-label="Hypothetical amount">
                    <PrivacyValue
                      value={formatCurrency(row.hypotheticalAmount, currency)}
                      kind="fiat"
                    />
                  </td>
                  <td data-label="Projected allocation"
                    >{formatPercent(row.projectedAllocationPercentage)}</td
                  >
                  <td
                    data-label="Remaining drift"
                    class={driftClass(row.remainingDriftPercentagePoints)}
                  >
                    {formatPercentagePoints(row.remainingDriftPercentagePoints)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <p class="disclaimer">
        Informational only — this deterministic scenario is based solely on your saved targets and
        is not financial advice. It never proposes sales or executes trades.
      </p>
    </section>
  {/if}
</section>

{#if showEditor}
  <div class="modal-backdrop" role="presentation">
    <div
      class="modal plan-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-editor-title"
      aria-describedby={saveError ? 'plan-editor-error' : undefined}
    >
      <div class="modal-header">
        <div>
          <h2 id="plan-editor-title">
            {planning.plan ? 'Edit portfolio plan' : 'Create portfolio plan'}
          </h2>
          <p class="muted">One active plan · up to 50 target assets</p>
        </div>
        <button
          class="btn icon"
          type="button"
          aria-label="Close plan editor"
          on:click={() => (showEditor = false)}
        >
          <X size={18} />
        </button>
      </div>

      {#if saveError}
        <div class="notice modal-notice" id="plan-editor-error" role="alert">{saveError}</div>
      {/if}

      <form
        method="POST"
        action="?/save"
        use:enhance={submitAction('save', () => (showEditor = false))}
      >
        <div class="field-grid">
          <label class="field">
            <span class="field-label">Plan name</span>
            <input name="name" bind:value={planName} maxlength="120" required />
          </label>
          <label class="field">
            <span class="field-label">Target portfolio value ({currency})</span>
            <input
              name="target_value"
              type="text"
              inputmode="decimal"
              bind:value={targetValue}
              required
            />
          </label>
          <label class="field full">
            <span class="field-label">Target date (optional)</span>
            <span class="date-input"
              ><CalendarDays size={17} /><input
                name="target_date"
                type="date"
                bind:value={targetDate}
              /></span
            >
          </label>
        </div>

        <div class="target-editor-head">
          <div>
            <h3>Allocation targets</h3>
            <span class="field-hint">Every target must be positive and unique.</span>
          </div>
          <div
            class="target-total"
            class:valid={targetTotal.eq(100)}
            class:invalid={!targetTotal.eq(100)}
          >
            <span>Total</span>
            <strong>{targetTotal.toString()}%</strong>
          </div>
        </div>

        <div class="target-rows">
          {#each targetRows as row, index (row.key)}
            <div class="target-row">
              <span class="row-number">{index + 1}</span>
              <div class="target-search">
                <AssetSearch
                  inputId={`plan-asset-${row.key}`}
                  initialProvider={row.provider}
                  initialProviderCoinId={row.providerCoinId}
                  initialSymbol={row.symbol}
                  initialName={row.name}
                  initialImageUrl={row.imageUrl}
                  on:select={(event) => selectTarget(row.key, event.detail)}
                />
              </div>
              <label class="field percent-field">
                <span class="field-label">Target %</span>
                <input
                  name="target_percentage"
                  type="text"
                  inputmode="decimal"
                  bind:value={row.targetPercentage}
                  required
                />
              </label>
              <button
                class="btn icon danger remove-target"
                type="button"
                aria-label={`Remove ${row.symbol || `target ${index + 1}`}`}
                on:click={() => removeTarget(row.key)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          {/each}
        </div>

        <button
          class="btn add-target"
          type="button"
          on:click={addTarget}
          disabled={targetRows.length >= 50}
        >
          <Plus size={17} />
          Add target asset
        </button>

        {#if !targetTotal.eq(100)}
          <p class="total-hint" role="status">
            {targetTotal.lt(100)
              ? `${new Decimal(100).minus(targetTotal).toString()} percentage points remain.`
              : `Reduce the total by ${targetTotal.minus(100).toString()} percentage points.`}
          </p>
        {/if}

        <div class="modal-actions">
          <button class="btn" type="button" on:click={() => (showEditor = false)}>Cancel</button>
          <button
            class="btn primary"
            type="submit"
            disabled={!canSave || submittingIntent === 'save'}
            aria-busy={submittingIntent === 'save'}
          >
            {submittingIntent === 'save' ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if showClear}
  <div class="modal-backdrop" role="presentation">
    <div class="modal confirm" role="dialog" aria-modal="true" aria-labelledby="clear-plan-title">
      <div class="modal-header">
        <h2 id="clear-plan-title">Clear active plan?</h2>
        <button
          class="btn icon"
          type="button"
          aria-label="Close confirmation"
          on:click={() => (showClear = false)}
        >
          <X size={18} />
        </button>
      </div>
      <p class="muted">
        This removes only the plan and its allocation targets. Transactions and accounting data stay
        unchanged.
      </p>
      {#if clearError}
        <div class="notice modal-notice" role="alert">{clearError}</div>
      {/if}
      <form
        method="POST"
        action="?/clear"
        use:enhance={submitAction('clear', () => (showClear = false))}
      >
        <div class="modal-actions">
          <button class="btn" type="button" on:click={() => (showClear = false)}>Cancel</button>
          <button
            class="btn danger"
            type="submit"
            disabled={submittingIntent === 'clear'}
            aria-busy={submittingIntent === 'clear'}
          >
            {submittingIntent === 'clear' ? 'Clearing…' : 'Clear plan'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .planning-page {
    display: grid;
    gap: 1rem;
  }

  .page-header {
    margin-bottom: 0;
  }

  .toolbar,
  .asset-cell,
  .date-input,
  .section-icon {
    align-items: center;
    display: flex;
  }

  .toolbar {
    gap: 0.5rem;
  }

  .plan-empty {
    min-height: 360px;
  }

  .empty-icon,
  .section-icon {
    align-items: center;
    background: rgba(45, 212, 191, 0.12);
    border: 1px solid rgba(45, 212, 191, 0.24);
    border-radius: 8px;
    color: var(--accent);
    display: inline-flex;
    justify-content: center;
  }

  .empty-icon {
    height: 3rem;
    width: 3rem;
  }

  .plan-hero {
    display: grid;
    gap: 1rem;
  }

  .hero-title,
  .section-head,
  .target-editor-head {
    align-items: flex-start;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
  }

  .hero-title h2 {
    font-size: clamp(1.35rem, 2.5vw, 2rem);
    margin-top: 0.2rem;
  }

  .eyebrow,
  .metric-label {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .target-value {
    display: grid;
    gap: 0.25rem;
    justify-items: end;
  }

  :global(.target-amount) {
    font-size: 1.45rem;
    font-weight: 800;
  }

  .progress-track {
    background: var(--surface-soft);
    border-radius: 999px;
    height: 0.65rem;
    overflow: hidden;
  }

  .progress-track span {
    background: linear-gradient(90deg, var(--accent), var(--blue));
    border-radius: inherit;
    display: block;
    height: 100%;
  }

  .hero-metrics {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .hero-metrics > div {
    border-left: 1px solid var(--border);
    display: grid;
    gap: 0.3rem;
    min-width: 0;
    padding-left: 0.8rem;
  }

  .hero-metrics strong,
  :global(.metric-strong) {
    font-size: 1rem;
    overflow-wrap: anywhere;
  }

  .metric-note,
  :global(.metric-note) {
    color: var(--subtle);
    font-size: 0.78rem;
  }

  .completeness-notice,
  .neutral-notice {
    align-items: flex-start;
    display: flex;
    gap: 0.6rem;
  }

  .completeness-notice div {
    display: grid;
    gap: 0.25rem;
  }

  .neutral-notice {
    background: rgba(96, 165, 250, 0.1);
    border-color: rgba(96, 165, 250, 0.26);
    color: #bfdbfe;
  }

  .section-head > div {
    display: grid;
    gap: 0.25rem;
  }

  .allocation-section,
  .market-signals-section,
  .scenario-section {
    display: grid;
    gap: 0.9rem;
  }

  .signal-health-row,
  .signal-asset-labels,
  .signal-actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .signal-pill,
  .candidate-label,
  .signal-state {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 800;
    padding: 0.28rem 0.52rem;
  }

  .candidate-label,
  .signal-state.favorable {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.32);
    color: var(--positive);
  }

  .signal-state.unavailable {
    background: rgba(245, 158, 11, 0.09);
    border-color: rgba(245, 158, 11, 0.28);
    color: #f8d891;
  }

  .sentiment-context {
    align-items: center;
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    padding: 0.8rem;
  }

  .sentiment-context > div {
    display: grid;
    gap: 0.22rem;
  }

  .sentiment-context small,
  .signal-summary-grid small,
  .signal-detail small {
    color: var(--muted);
  }

  .sentiment-context a,
  .signal-detail a,
  .market-signals-section .disclaimer a {
    color: var(--accent);
    font-size: 0.8rem;
    font-weight: 750;
  }

  .signal-success {
    border-color: rgba(34, 197, 94, 0.32);
  }

  .signal-asset-list,
  .signal-detail-list {
    display: grid;
    gap: 0.75rem;
  }

  .signal-asset-card {
    background: rgba(255, 255, 255, 0.015);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: grid;
    gap: 0.8rem;
    padding: 0.9rem;
  }

  .signal-asset-card.candidate {
    border-color: rgba(34, 197, 94, 0.36);
  }

  .signal-asset-head {
    align-items: center;
    display: flex;
    gap: 0.8rem;
    justify-content: space-between;
  }

  .signal-summary-grid {
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .signal-summary-grid > span {
    display: grid;
    gap: 0.2rem;
  }

  .signal-actions {
    justify-content: space-between;
  }

  .signal-actions details {
    flex: 1 1 480px;
  }

  .signal-actions summary {
    color: var(--accent);
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .signal-detail-list {
    margin-top: 0.75rem;
  }

  .signal-detail {
    border-left: 2px solid var(--border);
    display: grid;
    gap: 0.3rem;
    grid-template-columns: 1fr auto;
    padding: 0.35rem 0 0.35rem 0.7rem;
  }

  .signal-detail > div {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .signal-detail p,
  .signal-detail small {
    grid-column: 1 / -1;
  }

  .signal-reason {
    color: #f8d891 !important;
  }

  .suppression-reasons {
    background: rgba(245, 158, 11, 0.06);
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: 8px;
    color: #f8d891;
    display: grid;
    font-size: 0.8rem;
    gap: 0.3rem;
    padding: 0.65rem 0.75rem;
  }

  .suppression-reasons ul {
    display: grid;
    gap: 0.15rem;
    margin: 0;
    padding-left: 1.1rem;
  }

  .asset-cell {
    gap: 0.65rem;
  }

  .asset-cell > span {
    display: grid;
    gap: 0.12rem;
  }

  .asset-cell small,
  .section-foot,
  .disclaimer {
    color: var(--subtle);
    font-size: 0.8rem;
  }

  .unavailable {
    color: #f8d891;
  }

  .section-icon {
    float: left;
    height: 2rem;
    margin-right: 0.65rem;
    width: 2rem;
  }

  .scenario-form {
    align-items: end;
    display: grid;
    gap: 0.65rem;
    grid-template-columns: minmax(220px, 360px) auto;
    justify-content: start;
  }

  .scenario-notice {
    max-width: 720px;
  }

  .scenario-summary {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 0.8rem;
  }

  .scenario-summary span {
    display: flex;
    gap: 0.4rem;
  }

  .scenario-summary :global(.privacy-mask) {
    color: var(--text);
    font-weight: 800;
  }

  .scenario-table {
    margin-top: 0.1rem;
  }

  .disclaimer {
    border-top: 1px solid var(--border);
    padding-top: 0.8rem;
  }

  .plan-modal {
    max-width: 900px;
    width: min(900px, 100%);
  }

  .modal-header > div {
    display: grid;
    gap: 0.25rem;
  }

  .modal-notice {
    margin-bottom: 0.8rem;
  }

  .date-input {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    gap: 0.5rem;
    padding-left: 0.75rem;
  }

  .date-input input {
    background: transparent;
    border: 0;
  }

  .target-editor-head {
    border-top: 1px solid var(--border);
    margin-top: 1rem;
    padding-top: 1rem;
  }

  .target-editor-head > div:first-child {
    display: grid;
    gap: 0.25rem;
  }

  .target-total {
    align-items: end;
    border: 1px solid var(--border);
    border-radius: 8px;
    display: grid;
    gap: 0.15rem;
    justify-items: end;
    min-width: 100px;
    padding: 0.55rem 0.7rem;
  }

  .target-total span {
    color: var(--muted);
    font-size: 0.75rem;
  }

  .target-total.valid {
    border-color: rgba(34, 197, 94, 0.45);
    color: var(--positive);
  }

  .target-total.invalid {
    border-color: rgba(245, 158, 11, 0.45);
    color: #f8d891;
  }

  .target-rows {
    display: grid;
    gap: 0.8rem;
    margin-top: 0.8rem;
  }

  .target-row {
    align-items: end;
    background: rgba(255, 255, 255, 0.015);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: grid;
    gap: 0.65rem;
    grid-template-columns: auto minmax(0, 1fr) 120px auto;
    padding: 0.8rem;
  }

  .row-number {
    align-items: center;
    background: var(--surface-soft);
    border-radius: 50%;
    color: var(--muted);
    display: flex;
    font-size: 0.75rem;
    height: 1.75rem;
    justify-content: center;
    margin-bottom: 0.5rem;
    width: 1.75rem;
  }

  .target-search {
    min-width: 0;
  }

  .percent-field input {
    min-width: 0;
  }

  .remove-target {
    margin-bottom: 0.1rem;
  }

  .add-target {
    margin-top: 0.8rem;
  }

  .total-hint {
    color: #f8d891;
    font-size: 0.82rem;
    margin-top: 0.65rem;
  }

  .confirm {
    max-width: 520px;
  }

  .confirm .modal-notice {
    margin-top: 0.8rem;
  }

  @media (max-width: 1180px) {
    .hero-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .toolbar,
    .hero-title,
    .section-head {
      display: grid;
      width: 100%;
    }

    .toolbar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .target-value {
      justify-items: start;
    }

    .hero-metrics,
    .signal-summary-grid,
    .scenario-form {
      grid-template-columns: 1fr;
    }

    .sentiment-context,
    .signal-asset-head {
      align-items: flex-start;
      display: grid;
    }

    .scenario-form .btn {
      width: 100%;
    }

    .target-row {
      align-items: stretch;
      grid-template-columns: 1fr auto;
    }

    .row-number {
      display: none;
    }

    .target-search {
      grid-column: 1 / -1;
    }

    .percent-field {
      grid-column: 1;
    }

    .remove-target {
      align-self: end;
      grid-column: 2;
    }
  }
</style>
