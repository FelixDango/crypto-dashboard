<script lang="ts">
  import CryptoIcon from '$lib/components/CryptoIcon.svelte';
  import { formatCrypto, formatCurrency, formatPercent, signedClass } from '$lib/format';
  import type { PortfolioOverview } from '$lib/types';

  export let data: {
    overview: PortfolioOverview;
  };

  $: currency = data.overview.totals.baseCurrency;
</script>

<section class="page">
  <div class="page-header">
    <div class="page-title">
      <h1>Assets</h1>
      <p class="muted">{data.overview.holdings.length} tracked assets</p>
    </div>
  </div>

  <section class="card holdings-card">
    {#if data.overview.holdings.length === 0}
      <div class="empty-state">
        <h2>No holdings yet</h2>
        <a class="btn primary" href="/transactions">Add transaction</a>
      </div>
    {:else}
      <div class="table-wrap mobile-cards">
        <table class="mobile-card-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Quantity</th>
              <th>Average cost</th>
              <th>Current price</th>
              <th>Value</th>
              <th>Unrealized P/L</th>
              <th>ROI</th>
              <th>Allocation</th>
            </tr>
          </thead>
          <tbody>
            {#each data.overview.holdings as holding}
              <tr>
                <td class="primary-cell" data-label="Asset">
                  <div class="asset-cell">
                    <CryptoIcon
                      src={holding.imageUrl}
                      symbol={holding.assetSymbol}
                      name={holding.assetName}
                      size={30}
                    />
                    <span>
                      <strong>{holding.assetSymbol}</strong>
                      <small>{holding.assetName}</small>
                    </span>
                  </div>
                </td>
                <td data-label="Quantity">{formatCrypto(holding.quantity)}</td>
                <td data-label="Average cost">{formatCurrency(holding.averageCost, currency)}</td>
                <td data-label="Current price">
                  {formatCurrency(holding.currentPrice, currency)}
                  {#if holding.stalePrice}
                    <span class="stale">stale</span>
                  {/if}
                </td>
                <td data-label="Value">{formatCurrency(holding.currentValue, currency)}</td>
                <td data-label="Unrealized P/L" class={signedClass(holding.unrealizedProfit)}>
                  {formatCurrency(holding.unrealizedProfit, currency)}
                </td>
                <td data-label="ROI" class={signedClass(holding.roiPercent)}>
                  {formatPercent(holding.roiPercent)}
                </td>
                <td data-label="Allocation">{formatPercent(holding.allocationPercent)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</section>

<style>
  .holdings-card {
    padding: 0;
  }

  .asset-cell {
    align-items: center;
    display: flex;
    gap: 0.65rem;
  }

  .asset-cell span {
    display: grid;
    gap: 0.12rem;
  }

  .asset-cell small {
    color: var(--muted);
  }

  .stale {
    border: 1px solid rgba(245, 158, 11, 0.36);
    border-radius: 999px;
    color: var(--amber);
    font-size: 0.72rem;
    margin-left: 0.35rem;
    padding: 0.1rem 0.35rem;
  }
</style>
