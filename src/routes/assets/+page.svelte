<script lang="ts">
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
      <div class="table-wrap">
        <table>
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
                <td>
                  <div class="asset-cell">
                    {#if holding.imageUrl}
                      <img src={holding.imageUrl} alt="" />
                    {/if}
                    <span>
                      <strong>{holding.assetSymbol}</strong>
                      <small>{holding.assetName}</small>
                    </span>
                  </div>
                </td>
                <td>{formatCrypto(holding.quantity)}</td>
                <td>{formatCurrency(holding.averageCost, currency)}</td>
                <td>
                  {formatCurrency(holding.currentPrice, currency)}
                  {#if holding.stalePrice}
                    <span class="stale">stale</span>
                  {/if}
                </td>
                <td>{formatCurrency(holding.currentValue, currency)}</td>
                <td class={signedClass(holding.unrealizedProfit)}>
                  {formatCurrency(holding.unrealizedProfit, currency)}
                </td>
                <td class={signedClass(holding.roiPercent)}>{formatPercent(holding.roiPercent)}</td>
                <td>{formatPercent(holding.allocationPercent)}</td>
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

  .asset-cell img {
    border-radius: 50%;
    height: 30px;
    width: 30px;
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
