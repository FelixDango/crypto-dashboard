<script lang="ts">
  import CryptoIcon from '$lib/components/CryptoIcon.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import { formatCrypto, formatCurrency, formatPercent, signedClass } from '$lib/format';
  import type { PortfolioOverview } from '$lib/types';

  export let data: {
    overview: PortfolioOverview;
  };

  $: currency = data.overview.totals.baseCurrency;

  function assetHref(assetId: string) {
    return `/assets/${encodeURIComponent(assetId)}`;
  }
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
              <th>Average open cost</th>
              <th>Current price</th>
              <th>Value</th>
              <th>Unrealized P/L</th>
              <th>Realized P/L</th>
              <th>ROI</th>
              <th>Fees</th>
              <th>Allocation</th>
            </tr>
          </thead>
          <tbody>
            {#each data.overview.holdings as holding}
              <tr>
                <td class="primary-cell" data-label="Asset">
                  <a class="asset-cell" href={assetHref(holding.assetId)}>
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
                  </a>
                </td>
                <td data-label="Quantity">
                  <PrivacyValue value={formatCrypto(holding.quantity)} kind="quantity" />
                </td>
                <td data-label="Average open cost">
                  <PrivacyValue value={formatCurrency(holding.averageCost, currency)} kind="fiat" />
                </td>
                <td data-label="Current price">
                  <PrivacyValue
                    value={formatCurrency(holding.currentPrice, currency)}
                    kind="fiat"
                  />
                  {#if holding.stalePrice}
                    <span class="stale">stale</span>
                  {/if}
                </td>
                <td data-label="Value">
                  <PrivacyValue
                    value={formatCurrency(holding.currentValue, currency)}
                    kind="fiat"
                  />
                </td>
                <td data-label="Unrealized P/L" class={signedClass(holding.unrealizedProfit)}>
                  <PrivacyValue
                    value={formatCurrency(holding.unrealizedProfit, currency)}
                    kind="fiat"
                  />
                </td>
                <td data-label="Realized P/L" class={signedClass(holding.realizedProfit)}>
                  <PrivacyValue
                    value={formatCurrency(holding.realizedProfit, currency)}
                    kind="fiat"
                  />
                </td>
                <td data-label="ROI" class={signedClass(holding.roiPercent)}>
                  {formatPercent(holding.roiPercent)}
                </td>
                <td data-label="Fees">
                  <PrivacyValue value={formatCurrency(holding.totalFees, currency)} kind="fiat" />
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

  .asset-cell:hover strong {
    color: var(--accent);
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
