<script lang="ts">
  import { Download, Save } from '@lucide/svelte';
  import { enhance } from '$app/forms';

  export let data: {
    settings: {
      baseCurrency: 'EUR' | 'USD';
      priceProvider: string;
    };
    providers: Array<{ id: string; label: string }>;
    databasePath: string;
    version: string;
    nodeEnv: string;
  };
  export let form: { error?: string; success?: boolean } | null;
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

  .backup-card {
    display: grid;
    gap: 1rem;
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
  }
</style>
