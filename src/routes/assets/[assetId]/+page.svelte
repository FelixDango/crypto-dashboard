<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import CryptoIcon from '$lib/components/CryptoIcon.svelte';
  import {
    formatCrypto,
    formatCurrency,
    formatDate,
    formatPercent,
    signedClass
  } from '$lib/format';
  import type { HoldingSummary } from '$lib/types';

  export let data: {
    asset: HoldingSummary;
    baseCurrency: 'EUR' | 'USD';
  };

  $: asset = data.asset;
  $: currency = data.baseCurrency;
</script>

<section class="page">
  <div class="page-header">
    <div class="page-title">
      <a class="back-link" href="/assets">
        <ArrowLeft size={16} />
        Assets
      </a>
      <div class="asset-title">
        <CryptoIcon
          src={asset.imageUrl}
          symbol={asset.assetSymbol}
          name={asset.assetName}
          size={38}
        />
        <span>
          <h1>{asset.assetSymbol}</h1>
          <p class="muted">{asset.assetName}</p>
        </span>
      </div>
    </div>
  </div>

  <div class="grid metric-grid">
    <article class="card metric-card">
      <span class="label">Quantity</span>
      <strong class="value">{formatCrypto(asset.quantity)}</strong>
      <span class="meta">Current recorded balance</span>
    </article>
    <article class="card metric-card">
      <span class="label">Average cost</span>
      <strong class="value">{formatCurrency(asset.averageCost, currency)}</strong>
      <span class="meta">Chronological average cost</span>
    </article>
    <article class="card metric-card">
      <span class="label">Realized P/L</span>
      <strong class="value {signedClass(asset.realizedProfit)}">
        {formatCurrency(asset.realizedProfit, currency)}
      </strong>
      <span class="meta">Sells matched to running average</span>
    </article>
    <article class="card metric-card">
      <span class="label">Total fees</span>
      <strong class="value">{formatCurrency(asset.totalFees, currency)}</strong>
      <span class="meta">Normalized into base currency</span>
    </article>
  </div>

  <div class="grid two-column detail-grid">
    <section class="card">
      <div class="section-head">
        <h2>Current valuation</h2>
        <span class={`status ${asset.priceStatus}`}>{asset.priceStatus}</span>
      </div>
      <dl class="detail-list">
        <div>
          <dt>Current price</dt>
          <dd>{formatCurrency(asset.currentPrice, currency)}</dd>
        </div>
        <div>
          <dt>Current value</dt>
          <dd>{formatCurrency(asset.currentValue, currency)}</dd>
        </div>
        <div>
          <dt>Open cost basis</dt>
          <dd>{formatCurrency(asset.costBasis, currency)}</dd>
        </div>
        <div>
          <dt>Unrealized P/L</dt>
          <dd class={signedClass(asset.unrealizedProfit)}>
            {formatCurrency(asset.unrealizedProfit, currency)}
          </dd>
        </div>
        <div>
          <dt>ROI</dt>
          <dd class={signedClass(asset.roiPercent)}>{formatPercent(asset.roiPercent)}</dd>
        </div>
        <div>
          <dt>Price source</dt>
          <dd>{asset.priceSource ?? 'No cached price'}</dd>
        </div>
        <div>
          <dt>Price timestamp</dt>
          <dd>{asset.priceCapturedAt ? formatDate(asset.priceCapturedAt) : '-'}</dd>
        </div>
      </dl>
    </section>

    <section class="card">
      <div class="section-head">
        <h2>Calculation notes</h2>
      </div>
      <p class="muted">
        Buys add fiat plus fees to cost basis. Sells realize profit against the average cost before
        the sell, then reduce the remaining open cost basis.
      </p>
    </section>
  </div>

  <section class="card ledger-card">
    <div class="section-head">
      <h2>Running ledger</h2>
      <span class="muted">{asset.ledger.length} entries</span>
    </div>
    <div class="table-wrap mobile-cards">
      <table class="mobile-card-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Quantity</th>
            <th>Fiat</th>
            <th>FX</th>
            <th>Running qty</th>
            <th>Avg cost</th>
            <th>Cost basis</th>
            <th>Realized P/L</th>
          </tr>
        </thead>
        <tbody>
          {#each asset.ledger as entry}
            <tr>
              <td data-label="Date">{formatDate(entry.transactionDate)}</td>
              <td data-label="Type">{entry.type}</td>
              <td data-label="Quantity">{formatCrypto(entry.quantity)}</td>
              <td data-label="Fiat">{formatCurrency(entry.normalizedFiatAmount, currency)}</td>
              <td data-label="FX">{entry.fxRate} · {entry.fxSource}</td>
              <td data-label="Running qty">{formatCrypto(entry.runningQuantity)}</td>
              <td data-label="Avg cost">{formatCurrency(entry.runningAverageCost, currency)}</td>
              <td data-label="Cost basis">{formatCurrency(entry.runningCostBasis, currency)}</td>
              <td data-label="Realized P/L" class={signedClass(entry.realizedProfit)}>
                {formatCurrency(entry.realizedProfit, currency)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</section>

<style>
  .back-link,
  .asset-title,
  .section-head {
    align-items: center;
    display: flex;
    gap: 0.65rem;
  }

  .back-link {
    color: var(--muted);
    font-size: 0.9rem;
    width: fit-content;
  }

  .asset-title {
    margin-top: 0.6rem;
  }

  .detail-grid,
  .ledger-card {
    margin-top: 1rem;
  }

  .section-head {
    justify-content: space-between;
    margin-bottom: 0.8rem;
  }

  .detail-list {
    display: grid;
    gap: 0.75rem;
    margin: 0;
  }

  dt {
    color: var(--muted);
    font-size: 0.78rem;
    text-transform: uppercase;
  }

  dd {
    margin: 0.15rem 0 0;
  }

  .status {
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted);
    font-size: 0.76rem;
    font-weight: 800;
    padding: 0.16rem 0.5rem;
    text-transform: uppercase;
  }

  .status.fresh {
    color: var(--positive);
  }

  .status.stale {
    color: var(--amber);
  }

  .status.missing {
    color: var(--negative);
  }

  @media (max-width: 680px) {
    .asset-title {
      align-items: flex-start;
    }
  }
</style>
