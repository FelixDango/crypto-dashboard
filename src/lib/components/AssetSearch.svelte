<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { Search } from '@lucide/svelte';
  import CryptoIcon from './CryptoIcon.svelte';

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
  export let inputId = 'asset-search';

  const dispatch = createEventDispatcher<{ select: AssetChoice }>();
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
  let activeIndex = -1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let requestController: AbortController | null = null;

  $: hasSelection = Boolean(selected.providerCoinId && selected.symbol && selected.name);
  $: activeOptionId = activeIndex >= 0 ? `asset-option-${activeIndex}` : undefined;

  function choose(asset: AssetChoice) {
    selected = asset;
    query = `${asset.symbol} - ${asset.name}`;
    open = false;
    activeIndex = -1;
    dispatch('select', asset);
  }

  async function search() {
    const cleaned = query.trim();
    if (cleaned.length < 2) {
      requestController?.abort();
      results = [];
      open = false;
      loading = false;
      return;
    }

    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    loading = true;
    try {
      const response = await fetch(`/api/assets/search?q=${encodeURIComponent(cleaned)}`, {
        signal: controller.signal
      });
      const nextResults = response.ok ? await response.json() : [];
      if (controller.signal.aborted || query.trim() !== cleaned) return;
      results = nextResults;
      open = results.length > 0;
      activeIndex = results.length > 0 ? 0 : -1;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    } finally {
      if (requestController === controller) {
        requestController = null;
        loading = false;
      }
    }
  }

  function onInput() {
    selected = {
      id: `${initialProvider}:`,
      provider: initialProvider,
      providerCoinId: '',
      symbol: '',
      name: '',
      imageUrl: null
    };
    if (timer) clearTimeout(timer);
    timer = setTimeout(search, 220);
  }

  function onKeydown(event: KeyboardEvent) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      if (results.length > 0) open = true;
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = results.length > 0 ? (activeIndex + 1) % results.length : -1;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = results.length > 0 ? (activeIndex - 1 + results.length) % results.length : -1;
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === 'Escape') {
      open = false;
      activeIndex = -1;
    }
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer);
    requestController?.abort();
  });
</script>

<div class="asset-search">
  <label class="field-label" for={inputId}>Coin</label>
  <div class="search-input">
    <Search size={17} aria-hidden="true" />
    <input
      id={inputId}
      name="asset_query"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls="asset-results"
      aria-activedescendant={activeOptionId}
      autocomplete="off"
      placeholder="Search BTC, ETH, SOL..."
      bind:value={query}
      on:input={onInput}
      on:keydown={onKeydown}
      on:focus={() => {
        if (results.length > 0) open = true;
      }}
      required
    />
  </div>

  {#if open}
    <div id="asset-results" class="asset-results" role="listbox" aria-label="Coin search results">
      {#each results as asset, index}
        <button
          id={`asset-option-${index}`}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          class="asset-choice"
          class:active={index === activeIndex}
          on:mouseenter={() => (activeIndex = index)}
          on:click={() => choose(asset)}
        >
          <CryptoIcon src={asset.imageUrl} symbol={asset.symbol} name={asset.name} size={28} />
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

  {#if hasSelection}
    <div class="selected-asset">
      <CryptoIcon src={selected.imageUrl} symbol={selected.symbol} name={selected.name} size={24} />
      <span>
        <strong>{selected.symbol}</strong>
        <small>{selected.name} · {selected.provider}:{selected.providerCoinId}</small>
      </span>
    </div>
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

  .asset-choice.active {
    background: var(--surface-soft);
    outline: 1px solid var(--border-strong);
  }

  .asset-choice span {
    display: grid;
    gap: 0.1rem;
  }

  .asset-choice small {
    color: var(--muted);
  }

  .selected-asset {
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    gap: 0.55rem;
    margin-top: 0.55rem;
    padding: 0.55rem 0.65rem;
  }

  .selected-asset span {
    display: grid;
    gap: 0.1rem;
  }

  .selected-asset small {
    color: var(--muted);
  }
</style>
