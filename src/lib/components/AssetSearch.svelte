<script lang="ts">
  import { Search } from '@lucide/svelte';

  type AssetChoice = {
    id: string;
    provider: string;
    providerCoinId: string;
    symbol: string;
    name: string;
    imageUrl: string | null;
  };

  export let initialProvider = 'coingecko';
  export let initialProviderCoinId = '';
  export let initialSymbol = '';
  export let initialName = '';
  export let initialImageUrl: string | null = null;

  let query = initialSymbol && initialName ? `${initialSymbol} - ${initialName}` : '';
  let selected: AssetChoice = {
    id: `${initialProvider}:${initialProviderCoinId}`,
    provider: initialProvider,
    providerCoinId: initialProviderCoinId,
    symbol: initialSymbol,
    name: initialName,
    imageUrl: initialImageUrl
  };
  let results: AssetChoice[] = [];
  let loading = false;
  let open = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function choose(asset: AssetChoice) {
    selected = asset;
    query = `${asset.symbol} - ${asset.name}`;
    open = false;
  }

  async function search() {
    const cleaned = query.trim();
    if (cleaned.length < 2) {
      results = [];
      open = false;
      return;
    }

    loading = true;
    try {
      const response = await fetch(`/api/assets/search?q=${encodeURIComponent(cleaned)}`);
      results = response.ok ? await response.json() : [];
      open = results.length > 0;
    } finally {
      loading = false;
    }
  }

  function onInput() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(search, 220);
  }
</script>

<div class="asset-search">
  <label class="field-label" for="asset-search">Coin</label>
  <div class="search-input">
    <Search size={17} aria-hidden="true" />
    <input
      id="asset-search"
      name="asset_query"
      autocomplete="off"
      placeholder="Search BTC, ETH, SOL..."
      bind:value={query}
      on:input={onInput}
      on:focus={() => {
        if (results.length > 0) open = true;
      }}
      required
    />
  </div>

  {#if open}
    <div class="asset-results">
      {#each results as asset}
        <button type="button" class="asset-choice" on:click={() => choose(asset)}>
          {#if asset.imageUrl}
            <img src={asset.imageUrl} alt="" />
          {/if}
          <span>
            <strong>{asset.symbol}</strong>
            <small>{asset.name}</small>
          </span>
        </button>
      {/each}
    </div>
  {/if}

  {#if loading}
    <span class="field-hint">Searching...</span>
  {/if}

  <input type="hidden" name="asset_provider" value={selected.provider} />
  <input type="hidden" name="asset_provider_coin_id" value={selected.providerCoinId} />
  <input type="hidden" name="asset_symbol" value={selected.symbol} />
  <input type="hidden" name="asset_name" value={selected.name} />
  <input type="hidden" name="asset_image_url" value={selected.imageUrl ?? ''} />
</div>

<style>
  .asset-search {
    position: relative;
  }

  .search-input {
    align-items: center;
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    gap: 0.65rem;
    padding: 0 0.8rem;
  }

  .search-input input {
    background: transparent;
    border: 0;
    color: var(--text);
    height: 2.75rem;
    outline: none;
    width: 100%;
  }

  .asset-results {
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    box-shadow: var(--shadow);
    left: 0;
    max-height: 260px;
    overflow: auto;
    padding: 0.35rem;
    position: absolute;
    right: 0;
    top: calc(100% + 0.4rem);
    z-index: 20;
  }

  .asset-choice {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    display: flex;
    gap: 0.7rem;
    padding: 0.65rem;
    text-align: left;
    width: 100%;
  }

  .asset-choice:hover {
    background: var(--surface-soft);
  }

  .asset-choice img {
    border-radius: 50%;
    height: 28px;
    width: 28px;
  }

  .asset-choice span {
    display: grid;
    gap: 0.1rem;
  }

  .asset-choice small {
    color: var(--muted);
  }
</style>
