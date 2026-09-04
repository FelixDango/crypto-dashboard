<script lang="ts">
  import { ChevronDown, Download, Save, TriangleAlert, Trash2 } from '@lucide/svelte';
  import { enhance } from '$app/forms';
  import type { MarketSignalSettings } from '$lib/market-signals/types';

  export let data: {
    settings: {
      baseCurrency: 'EUR' | 'USD';
      priceProvider: string;
    };
    signalSettings: MarketSignalSettings;
    providers: Array<{ id: string; label: string }>;
    databasePath: string;
    version: string;
    nodeEnv: string;
    resetPreviews: Record<
      'portfolio' | 'full',
      { totalRows: number; counts: Record<string, number> }
    >;
    resetCategoryLabels: Record<string, string>;
    resetCategories: Record<'portfolio' | 'full', string[]>;
  };
  export let form: {
    error?: string;
    success?: boolean;
    intent?: 'preferences' | 'signals' | 'reset';
  } | null;
  let requiredFavorableCount = String(data.signalSettings.requiredFavorableCount);
  let resetScope: '' | 'portfolio' | 'full' = '';
  let resetAcknowledged = false;
  let resetPhrase = '';
  $: selectedPreview = resetScope ? data.resetPreviews[resetScope] : null;
  $: resetReady =
    Boolean(resetScope) && resetAcknowledged && resetPhrase === 'DELETE ALL TEST DATA';
</script>

<section class="page settings-page">
  <div class="page-header">
    <h1>Settings</h1>
  </div>

  {#if form?.error}
    <div class="notice">{form.error}</div>
  {:else if form?.success}
    <div class="notice success-notice">
      {form.intent === 'signals' ? 'Market signal thresholds saved.' : 'Preferences saved.'}
    </div>
  {/if}

  <section class="preference-row">
    <div>
      <h2>Base currency</h2>
      <p class="muted">Used for portfolio values and reporting.</p>
    </div>
    <form class="currency-form" method="POST" action="?/update" use:enhance>
      <input type="hidden" name="price_provider" value={data.settings.priceProvider} />
      <label class="field compact-field">
        <span class="field-label">Currency</span>
        <select id="base-currency" name="base_currency">
          <option value="EUR" selected={data.settings.baseCurrency === 'EUR'}>EUR</option>
          <option value="USD" selected={data.settings.baseCurrency === 'USD'}>USD</option>
        </select>
      </label>
      <button class="btn primary" type="submit">
        <Save size={17} />
        Save
      </button>
    </form>
  </section>

  <details class="settings-disclosure">
    <summary>
      <span>
        <strong>Market signal thresholds</strong>
        <small>Advanced defaults for the optional planning signals</small>
      </span>
      <ChevronDown size={18} />
    </summary>
    <div class="disclosure-content">
      <p class="muted">
        Conservative thresholds used for informational candidate ranking. All five fresh signals are
        still required.
      </p>
      <form method="POST" action="?/updateSignals" use:enhance>
        <div class="field-grid signal-grid">
          <label class="field">
            <span class="field-label">Fear &amp; Greed maximum</span>
            <input
              name="fear_greed_max"
              type="text"
              inputmode="decimal"
              value={data.signalSettings.fearGreedMax}
              required
            />
            <span class="field-hint">0–100 · default 25</span>
          </label>
          <label class="field">
            <span class="field-label">RSI (14) maximum</span>
            <input
              name="rsi_14_max"
              type="text"
              inputmode="decimal"
              value={data.signalSettings.rsi14Max}
              required
            />
            <span class="field-hint">0–100 · default 30</span>
          </label>
          <label class="field">
            <span class="field-label">200-day SMA deviation maximum (%)</span>
            <input
              name="sma_200_deviation_max"
              type="text"
              inputmode="decimal"
              value={data.signalSettings.sma200DeviationMax}
              required
            />
            <span class="field-hint">−100 to 100 · default −10</span>
          </label>
          <label class="field">
            <span class="field-label">365-day drawdown maximum (%)</span>
            <input
              name="drawdown_365_max"
              type="text"
              inputmode="decimal"
              value={data.signalSettings.drawdown365Max}
              required
            />
            <span class="field-hint">−100 to 0 · default −30</span>
          </label>
          <label class="field">
            <span class="field-label">Bollinger position maximum</span>
            <input
              name="bollinger_z_max"
              type="text"
              inputmode="decimal"
              value={data.signalSettings.bollingerZMax}
              required
            />
            <span class="field-hint">−10 to 10 · default −1.5</span>
          </label>
          <label class="field">
            <span class="field-label">Required favorable signals</span>
            <select name="required_favorable_count" bind:value={requiredFavorableCount}>
              {#each [1, 2, 3, 4, 5] as count}
                <option value={String(count)}>{count} of 5</option>
              {/each}
            </select>
            <span class="field-hint">Default 4 of 5</span>
          </label>
        </div>
        <div class="settings-actions">
          <button class="btn primary" type="submit">
            <Save size={17} />
            Save thresholds
          </button>
        </div>
      </form>
    </div>
  </details>

  <details class="settings-disclosure danger-disclosure" data-testid="danger-zone">
    <summary>
      <span>
        <strong>Data &amp; reset</strong>
        <small>Download a backup or permanently remove local data</small>
      </span>
      <ChevronDown size={18} />
    </summary>
    <div class="disclosure-content danger-zone">
      <div class="backup-warning">
        <div>
          <strong>Backup</strong>
          <span>Download a copy of the local database.</span>
        </div>
        <a class="btn" href="/api/backup"><Download size={17} /> Download</a>
      </div>

      <div class="danger-heading">
        <TriangleAlert size={20} />
        <div>
          <h2>Delete local data</h2>
          <p class="muted">This cannot be undone. Download a backup first.</p>
        </div>
      </div>

      <form method="POST" action="?/resetData" use:enhance>
        <fieldset>
          <legend>Select exactly one reset scope</legend>
          <label class="scope-option">
            <input type="radio" name="scope" value="portfolio" bind:group={resetScope} />
            <span>
              <strong>Portfolio and planning</strong>
              <small
                >Ledger, accounting, snapshots, prices, FX cache, plans, and orphaned assets.</small
              >
            </span>
          </label>
          <label class="scope-option">
            <input type="radio" name="scope" value="full" bind:group={resetScope} />
            <span>
              <strong>Full historical data</strong>
              <small>Adds news, market-signal, sentiment, and other fetched history.</small>
            </span>
          </label>
        </fieldset>

        {#if resetScope && selectedPreview}
          <div class="reset-preview" data-testid="reset-preview">
            <div>
              <strong>{selectedPreview.totalRows} rows will be deleted</strong>
              <span
                >Settings, migration history, configured news sources, and backup files stay.</span
              >
            </div>
            <dl>
              {#each data.resetCategories[resetScope] as category}
                <div>
                  <dt>{data.resetCategoryLabels[category]}</dt>
                  <dd>{selectedPreview.counts[category]}</dd>
                </div>
              {/each}
            </dl>
          </div>
        {/if}

        <label class="acknowledgement">
          <input type="checkbox" name="acknowledged" bind:checked={resetAcknowledged} />
          <span>I understand this permanently deletes the listed data.</span>
        </label>

        <label class="field confirmation-field">
          <span class="field-label">Type DELETE ALL TEST DATA</span>
          <input
            name="confirmation_phrase"
            type="text"
            autocomplete="off"
            bind:value={resetPhrase}
            placeholder="DELETE ALL TEST DATA"
          />
        </label>

        <button
          class="btn destructive"
          type="submit"
          disabled={!resetReady}
          data-testid="reset-submit"
        >
          <Trash2 size={17} /> Permanently delete selected data
        </button>
      </form>
    </div>
  </details>
</section>

<style>
  .settings-page {
    max-width: 920px;
  }

  .page-header {
    margin-bottom: 0.75rem;
  }

  .preference-row {
    align-items: center;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    display: flex;
    gap: 2rem;
    justify-content: space-between;
    padding: 1.5rem 0;
  }

  .preference-row > div,
  .settings-disclosure summary > span,
  .backup-warning > div {
    display: grid;
    gap: 0.25rem;
  }

  .preference-row h2,
  .danger-heading h2 {
    margin: 0;
  }

  .currency-form {
    align-items: end;
    display: flex;
    gap: 0.65rem;
  }

  .compact-field {
    min-width: 8.5rem;
  }

  .settings-disclosure {
    border-bottom: 1px solid var(--border);
  }

  .settings-disclosure summary {
    align-items: center;
    cursor: pointer;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    list-style: none;
    min-height: 5rem;
    padding: 1rem 0;
  }

  .settings-disclosure summary::-webkit-details-marker {
    display: none;
  }

  .settings-disclosure summary small {
    color: var(--muted);
  }

  .settings-disclosure summary :global(svg) {
    color: var(--subtle);
    transition: transform 120ms ease;
  }

  .settings-disclosure[open] summary :global(svg) {
    transform: rotate(180deg);
  }

  .disclosure-content {
    padding: 0 0 1.5rem;
  }

  .disclosure-content > p {
    line-height: 1.55;
    margin: 0 0 1rem;
    max-width: 48rem;
  }

  .settings-actions {
    margin-top: 1rem;
  }

  .signal-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .success-notice {
    border-color: color-mix(in srgb, var(--positive) 35%, var(--border));
  }

  .danger-zone {
    display: grid;
    gap: 1rem;
  }

  .danger-heading,
  .backup-warning,
  .scope-option,
  .acknowledgement {
    align-items: flex-start;
    display: flex;
    gap: 0.7rem;
  }

  .danger-heading {
    color: #fca5a5;
  }

  .danger-heading h2 {
    color: var(--text);
  }

  .backup-warning {
    align-items: center;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.28);
    border-radius: 8px;
    flex-wrap: wrap;
    padding: 0.8rem;
  }

  .backup-warning > div span {
    color: var(--muted);
  }

  .backup-warning > div {
    flex: 1 1 12rem;
  }

  fieldset {
    border: 0;
    display: grid;
    gap: 0.65rem;
    margin: 0;
    padding: 0;
  }

  legend {
    font-weight: 800;
    margin-bottom: 0.65rem;
  }

  .scope-option,
  .acknowledgement {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    padding: 0.8rem;
  }

  .scope-option span {
    display: grid;
    gap: 0.2rem;
  }

  .scope-option small,
  .reset-preview span {
    color: var(--muted);
  }

  .reset-preview {
    background: rgba(248, 113, 113, 0.06);
    border: 1px solid rgba(248, 113, 113, 0.25);
    border-radius: 8px;
    display: grid;
    gap: 0.8rem;
    margin: 0.8rem 0;
    padding: 0.8rem;
  }

  .reset-preview > div:first-child {
    display: grid;
    gap: 0.2rem;
  }

  .reset-preview dl {
    gap: 0.35rem;
  }

  .reset-preview dl div {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }

  .reset-preview dd {
    font-variant-numeric: tabular-nums;
    margin: 0;
  }

  .confirmation-field {
    margin: 0.8rem 0;
    max-width: 30rem;
  }

  .destructive {
    background: #b91c1c;
    border-color: #dc2626;
    color: white;
  }

  .destructive:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  @media (max-width: 720px) {
    .preference-row,
    .currency-form {
      align-items: stretch;
      display: grid;
      width: 100%;
    }

    .signal-grid {
      grid-template-columns: 1fr;
    }

    .currency-form .btn {
      width: 100%;
    }
  }
</style>
