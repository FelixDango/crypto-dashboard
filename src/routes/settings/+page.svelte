<script lang="ts">
  import { Download, Save, TriangleAlert, Trash2 } from '@lucide/svelte';
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

<section class="page">
  <div class="page-header">
    <div class="page-title">
      <h1>Settings</h1>
      <p class="muted">Runtime and pricing preferences</p>
    </div>
  </div>

  {#if form?.error}
    <div class="notice">{form.error}</div>
  {:else if form?.success}
    <div class="notice success-notice">
      {form.intent === 'signals' ? 'Market signal thresholds saved.' : 'Preferences saved.'}
    </div>
  {/if}

  <div class="grid two-column">
    <section class="card">
      <h2>Preferences</h2>
      <form method="POST" action="?/update" use:enhance>
        <div class="field-grid settings-grid">
          <div class="field">
            <label class="field-label" for="base-currency">Base currency</label>
            <select id="base-currency" name="base_currency">
              <option value="EUR" selected={data.settings.baseCurrency === 'EUR'}>EUR</option>
              <option value="USD" selected={data.settings.baseCurrency === 'USD'}>USD</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="price-provider">Price provider</label>
            <select id="price-provider" name="price_provider">
              {#each data.providers as provider}
                <option value={provider.id} selected={data.settings.priceProvider === provider.id}>
                  {provider.label}
                </option>
              {/each}
            </select>
          </div>
        </div>
        <div class="settings-actions">
          <button class="btn primary" type="submit">
            <Save size={17} />
            Save
          </button>
        </div>
      </form>
    </section>

    <section class="card backup-card">
      <h2>Database</h2>
      <dl>
        <div>
          <dt>SQLite path</dt>
          <dd>{data.databasePath}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{data.version}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{data.nodeEnv}</dd>
        </div>
      </dl>
      <a class="btn" href="/api/backup">
        <Download size={17} />
        Backup
      </a>
    </section>
  </div>

  <section class="card signal-settings-card">
    <div>
      <h2>Planned-asset market signals</h2>
      <p class="muted">
        Global conservative thresholds used for informational candidate ranking. Equality counts as
        favorable, and all five fresh signals are still required.
      </p>
    </div>
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
          Save signal thresholds
        </button>
      </div>
    </form>
  </section>

  <section class="card danger-zone" data-testid="danger-zone">
    <div class="danger-heading">
      <TriangleAlert size={22} />
      <div>
        <h2>Danger zone</h2>
        <p class="muted">Permanently delete test or historical data. This cannot be undone.</p>
      </div>
    </div>

    <div class="backup-warning">
      <strong>Download a backup first.</strong>
      <span>A backup is not created automatically.</span>
      <a class="btn" href="/api/backup"><Download size={17} /> Download backup</a>
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
            <span>Settings, migration history, configured news sources, and backup files stay.</span
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
  </section>
</section>

<style>
  h2 {
    margin-bottom: 1rem;
  }

  .settings-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .settings-actions {
    margin-top: 1rem;
  }

  .signal-settings-card {
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
  }

  .signal-settings-card h2 {
    margin-bottom: 0.35rem;
  }

  .signal-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .success-notice {
    border-color: color-mix(in srgb, var(--positive) 35%, var(--border));
  }

  .backup-card {
    display: grid;
    gap: 1rem;
  }

  .danger-zone {
    border-color: rgba(248, 113, 113, 0.38);
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
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
    margin-bottom: 0.25rem;
  }

  .backup-warning {
    align-items: center;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.28);
    border-radius: 8px;
    flex-wrap: wrap;
    padding: 0.8rem;
  }

  .backup-warning span {
    color: var(--muted);
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

  dl {
    display: grid;
    gap: 0.75rem;
    margin: 0;
  }

  dt {
    color: var(--muted);
    font-size: 0.82rem;
  }

  dd {
    margin: 0.15rem 0 0;
    overflow-wrap: anywhere;
  }

  @media (max-width: 720px) {
    .settings-grid {
      grid-template-columns: 1fr;
    }

    .signal-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
