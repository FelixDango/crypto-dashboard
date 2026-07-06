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

  type OpenLot = {
    id: string;
    sourceTransactionId: string;
    originalQuantity: string;
    remainingQuantity: string;
    costBasisTotal: string;
    costBasisPerUnit: string;
    fiatCurrency: 'EUR' | 'USD';
    acquiredAt: string;
  };

  type Disposal = {
    id: string;
    sellTransactionId: string;
    lotId: string;
    quantitySold: string;
    proceedsAmount: string;
    costBasisAmount: string;
    realizedProfit: string;
    fiatCurrency: 'EUR' | 'USD';
    acquiredAt: string;
    disposedAt: string;
  };

  export let data: {
    asset: HoldingSummary;
    openLots: OpenLot[];
    disposals: Disposal[];
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
      <span class="label">Current holdings</span>
      <strong class="value">{formatCrypto(asset.quantity)}</strong>
      <span class="meta">Current recorded balance</span>
    </article>
    <article class="card metric-card">
      <span class="label">Current value</span>
      <strong class="value">{formatCurrency(asset.currentValue, currency)}</strong>
      <span class="meta">{formatCurrency(asset.currentPrice, currency)} per unit</span>
    </article>
    <article class="card metric-card">
      <span class="label">Unrealized P/L</span>
      <strong class="value {signedClass(asset.unrealizedProfit)}">
        {formatCurrency(asset.unrealizedProfit, currency)}
      </strong>
      <span class="meta">Current value minus open cost</span>
    </article>
    <article class="card metric-card">
      <span class="label">Realized P/L</span>
      <strong class="value {signedClass(asset.realizedProfit)}">
        {formatCurrency(asset.realizedProfit, currency)}
      </strong>
      <span class="meta">FIFO disposals</span>
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
          <dt>Open cost basis</dt>
          <dd>{formatCurrency(asset.costBasis, currency)}</dd>
        </div>
        <div>
          <dt>Average open cost</dt>
          <dd>{formatCurrency(asset.averageCost, currency)}</dd>
        </div>
        <div>
          <dt>Total P/L</dt>
          <dd class={signedClass(asset.totalProfit)}>
            {formatCurrency(asset.totalProfit, currency)}
          </dd>
        </div>
        <div>
          <dt>Total ROI</dt>
          <dd class={signedClass(asset.roiPercent)}>{formatPercent(asset.roiPercent)}</dd>
        </div>
        <div>
          <dt>Total fees</dt>
          <dd>{formatCurrency(asset.totalFees, currency)}</dd>
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
        <h2>Position</h2>
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
          <dt>Allocation</dt>
          <dd>{formatPercent(asset.allocationPercent)}</dd>
        </div>
        <div>
          <dt>Total buy cost</dt>
          <dd>{formatCurrency(asset.totalBuyCost, currency)}</dd>
        </div>
      </dl>
    </section>
  </div>

  <section class="card ledger-card">
    <div class="section-head">
      <h2>Open lots</h2>
      <span class="muted">{data.openLots.length} lots</span>
    </div>
    {#if data.openLots.length === 0}
      <div class="empty-state compact">
        <p class="muted">No open lots.</p>
      </div>
    {:else}
      <div class="table-wrap mobile-cards">
        <table class="mobile-card-table">
          <thead>
            <tr>
              <th>Acquired</th>
              <th>Original qty</th>
              <th>Remaining qty</th>
              <th>Unit cost</th>
              <th>Open cost</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {#each data.openLots as lot}
              <tr>
                <td data-label="Acquired">{formatDate(lot.acquiredAt)}</td>
                <td data-label="Original qty">{formatCrypto(lot.originalQuantity)}</td>
                <td data-label="Remaining qty">{formatCrypto(lot.remainingQuantity)}</td>
                <td data-label="Unit cost">
                  {formatCurrency(lot.costBasisPerUnit, lot.fiatCurrency)}
                </td>
                <td data-label="Open cost">
                  {formatCurrency(lot.costBasisTotal, lot.fiatCurrency)}
                </td>
                <td data-label="Source"><code>{lot.sourceTransactionId.slice(0, 8)}</code></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="card ledger-card">
    <div class="section-head">
      <h2>Disposals</h2>
      <span class="muted">{data.disposals.length} rows</span>
    </div>
    {#if data.disposals.length === 0}
      <div class="empty-state compact">
        <p class="muted">No sells recorded.</p>
      </div>
    {:else}
      <div class="table-wrap mobile-cards">
        <table class="mobile-card-table">
          <thead>
            <tr>
              <th>Disposed</th>
              <th>Acquired</th>
              <th>Quantity sold</th>
              <th>Proceeds</th>
              <th>Cost basis</th>
              <th>Realized P/L</th>
              <th>Lot</th>
            </tr>
          </thead>
          <tbody>
            {#each data.disposals as disposal}
              <tr>
                <td data-label="Disposed">{formatDate(disposal.disposedAt)}</td>
                <td data-label="Acquired">{formatDate(disposal.acquiredAt)}</td>
                <td data-label="Quantity sold">{formatCrypto(disposal.quantitySold)}</td>
                <td data-label="Proceeds">
                  {formatCurrency(disposal.proceedsAmount, disposal.fiatCurrency)}
                </td>
                <td data-label="Cost basis">
                  {formatCurrency(disposal.costBasisAmount, disposal.fiatCurrency)}
                </td>
                <td data-label="Realized P/L" class={signedClass(disposal.realizedProfit)}>
                  {formatCurrency(disposal.realizedProfit, disposal.fiatCurrency)}
                </td>
                <td data-label="Lot"><code>{disposal.lotId.slice(0, 8)}</code></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
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

  code {
    color: var(--muted);
    font-size: 0.82rem;
  }

  .compact {
    min-height: 84px;
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
