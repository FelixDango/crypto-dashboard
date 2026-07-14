<script lang="ts">
  import { ArrowLeft, ExternalLink, Newspaper } from '@lucide/svelte';
  import CryptoIcon from '$lib/components/CryptoIcon.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import {
    formatCrypto,
    formatCurrency,
    formatDate,
    formatPercent,
    signedClass
  } from '$lib/format';
  import type { HoldingSummary } from '$lib/types';
  import type { AssetNewsContext, NewsRange } from '$lib/server/news/context';

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
    newsRange: NewsRange;
    newsRanges: { value: NewsRange; label: string }[];
    newsContext: AssetNewsContext;
  };

  $: asset = data.asset;
  $: currency = data.baseCurrency;
  $: newsAsset = data.newsContext.asset;
  $: priced = asset.priceStatus !== 'missing';

  function signedPercent(value: number | null): string {
    if (value === null) return '-';
    return `${value > 0 ? '+' : ''}${formatPercent(value)}`;
  }

  function newsHref(assetId: string): string {
    return `/news?range=${data.newsRange}&asset=${encodeURIComponent(assetId)}`;
  }
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
      <PrivacyValue className="value" value={formatCrypto(asset.quantity)} kind="quantity" />
      <span class="meta">Current recorded balance</span>
    </article>
    <article class="card metric-card">
      <span class="label">Current value</span>
      {#if priced}
        <PrivacyValue
          className="value"
          value={formatCurrency(asset.currentValue, currency)}
          kind="fiat"
        />
      {:else}
        <span class="value muted">-</span>
      {/if}
      <span class="meta">
        {#if priced}
          <PrivacyValue value={formatCurrency(asset.currentPrice, currency)} kind="fiat" />
          per unit
        {:else}
          No cached market price
        {/if}
      </span>
    </article>
    <article class="card metric-card">
      <span class="label">Unrealized P/L</span>
      {#if priced}
        <PrivacyValue
          className={`value ${signedClass(asset.unrealizedProfit)}`}
          value={formatCurrency(asset.unrealizedProfit, currency)}
          kind="fiat"
        />
      {:else}
        <span class="value muted">-</span>
      {/if}
      <span class="meta">{priced ? 'Current value minus open cost' : 'Waiting for price'}</span>
    </article>
    <article class="card metric-card">
      <span class="label">Realized P/L</span>
      <PrivacyValue
        className={`value ${signedClass(asset.realizedProfit)}`}
        value={formatCurrency(asset.realizedProfit, currency)}
        kind="fiat"
      />
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
          <dd><PrivacyValue value={formatCurrency(asset.costBasis, currency)} kind="fiat" /></dd>
        </div>
        <div>
          <dt>Average open cost</dt>
          <dd><PrivacyValue value={formatCurrency(asset.averageCost, currency)} kind="fiat" /></dd>
        </div>
        <div>
          <dt>Total P/L</dt>
          {#if priced}
            <dd class={signedClass(asset.totalProfit)}>
              <PrivacyValue value={formatCurrency(asset.totalProfit, currency)} kind="fiat" />
            </dd>
          {:else}
            <dd class="muted">-</dd>
          {/if}
        </div>
        <div>
          <dt>Total ROI</dt>
          <dd class={priced ? signedClass(asset.roiPercent) : 'muted'}>
            {priced ? formatPercent(asset.roiPercent) : '-'}
          </dd>
        </div>
        <div>
          <dt>Total fees</dt>
          <dd><PrivacyValue value={formatCurrency(asset.totalFees, currency)} kind="fiat" /></dd>
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
          <dd>
            {#if priced}
              <PrivacyValue value={formatCurrency(asset.currentPrice, currency)} kind="fiat" />
            {:else}
              <span class="muted">-</span>
            {/if}
          </dd>
        </div>
        <div>
          <dt>Current value</dt>
          <dd>
            {#if priced}
              <PrivacyValue value={formatCurrency(asset.currentValue, currency)} kind="fiat" />
            {:else}
              <span class="muted">-</span>
            {/if}
          </dd>
        </div>
        <div>
          <dt>Allocation</dt>
          <dd>{priced ? formatPercent(asset.allocationPercent) : '-'}</dd>
        </div>
        <div>
          <dt>Total buy cost</dt>
          <dd><PrivacyValue value={formatCurrency(asset.totalBuyCost, currency)} kind="fiat" /></dd>
        </div>
      </dl>
    </section>
  </div>

  <section class="card asset-news-card">
    <div class="section-head">
      <div>
        <span class="eyebrow">Possible news context</span>
        <h2>Recent related headlines</h2>
      </div>
      <div class="asset-news-actions">
        <nav class="mini-tabs" aria-label="News range">
          {#each data.newsRanges as range}
            <a
              class:active={data.newsRange === range.value}
              href={`/assets/${encodeURIComponent(asset.assetId)}?newsRange=${range.value}`}
              aria-current={data.newsRange === range.value ? 'page' : undefined}
            >
              {range.label}
            </a>
          {/each}
        </nav>
        <a class="btn" href={newsHref(asset.assetId)}>
          <Newspaper size={17} />
          Full news
        </a>
      </div>
    </div>
    {#if !newsAsset || newsAsset.articles.length === 0}
      <div class="empty-state compact">
        <p class="muted">
          No recent related headlines matched {asset.assetSymbol} for {data.newsRange}.
        </p>
      </div>
    {:else}
      <div class="asset-news-layout">
        <aside>
          <span class="label">Recent price movement</span>
          <strong class={signedClass(newsAsset.priceChangePercent ?? 0)}>
            {signedPercent(newsAsset.priceChangePercent)}
          </strong>
          <p>{newsAsset.contextSummary}</p>
          <div class="theme-row">
            {#each newsAsset.themes as theme}
              <span>{theme}</span>
            {/each}
          </div>
        </aside>
        <div class="headline-list">
          {#each newsAsset.articles as article}
            <article>
              <div>
                <span>{article.source}</span>
                <span class="context-label {article.sentimentLabel}">
                  {article.sentimentLabel}
                </span>
              </div>
              <a href={article.url} target="_blank" rel="noreferrer">
                {article.title}
                <ExternalLink size={14} />
              </a>
            </article>
          {/each}
        </div>
      </div>
    {/if}
    <p class="disclaimer">{data.newsContext.disclaimer}</p>
  </section>

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
                <td data-label="Original qty">
                  <PrivacyValue value={formatCrypto(lot.originalQuantity)} kind="quantity" />
                </td>
                <td data-label="Remaining qty">
                  <PrivacyValue value={formatCrypto(lot.remainingQuantity)} kind="quantity" />
                </td>
                <td data-label="Unit cost">
                  <PrivacyValue
                    value={formatCurrency(lot.costBasisPerUnit, lot.fiatCurrency)}
                    kind="fiat"
                  />
                </td>
                <td data-label="Open cost">
                  <PrivacyValue
                    value={formatCurrency(lot.costBasisTotal, lot.fiatCurrency)}
                    kind="fiat"
                  />
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
                <td data-label="Quantity sold">
                  <PrivacyValue value={formatCrypto(disposal.quantitySold)} kind="quantity" />
                </td>
                <td data-label="Proceeds">
                  <PrivacyValue
                    value={formatCurrency(disposal.proceedsAmount, disposal.fiatCurrency)}
                    kind="fiat"
                  />
                </td>
                <td data-label="Cost basis">
                  <PrivacyValue
                    value={formatCurrency(disposal.costBasisAmount, disposal.fiatCurrency)}
                    kind="fiat"
                  />
                </td>
                <td data-label="Realized P/L" class={signedClass(disposal.realizedProfit)}>
                  <PrivacyValue
                    value={formatCurrency(disposal.realizedProfit, disposal.fiatCurrency)}
                    kind="fiat"
                  />
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
  .ledger-card,
  .asset-news-card {
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

  .eyebrow,
  .asset-news-card .label {
    color: var(--muted);
    font-size: 0.78rem;
  }

  .asset-news-actions,
  .mini-tabs,
  .asset-news-layout,
  .theme-row,
  .headline-list article div,
  .headline-list a {
    align-items: center;
    display: flex;
  }

  .asset-news-actions {
    gap: 0.5rem;
  }

  .mini-tabs {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    gap: 0.2rem;
    padding: 0.2rem;
  }

  .mini-tabs a {
    border-radius: 6px;
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 800;
    min-height: 2rem;
    min-width: 2.4rem;
    padding: 0.35rem 0.55rem;
    text-align: center;
  }

  .mini-tabs a:hover,
  .mini-tabs a.active {
    background: var(--surface-strong);
    color: var(--text);
  }

  .asset-news-layout {
    align-items: stretch;
    gap: 1rem;
  }

  .asset-news-layout aside {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: grid;
    flex: 0 0 290px;
    gap: 0.55rem;
    padding: 0.85rem;
  }

  .asset-news-layout aside strong {
    font-size: 1.7rem;
    line-height: 1;
  }

  .asset-news-layout aside p,
  .disclaimer {
    color: var(--muted);
    line-height: 1.45;
  }

  .theme-row {
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .theme-row span,
  .context-label {
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 800;
    padding: 0.16rem 0.48rem;
  }

  .headline-list {
    display: grid;
    flex: 1;
    gap: 0.65rem;
  }

  .headline-list article {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: grid;
    gap: 0.35rem;
    padding: 0.75rem;
  }

  .headline-list article div {
    gap: 0.5rem;
    justify-content: space-between;
  }

  .headline-list article div span:first-child {
    color: var(--muted);
    font-size: 0.78rem;
  }

  .headline-list a {
    gap: 0.3rem;
    line-height: 1.35;
  }

  .headline-list a:hover {
    color: var(--accent);
  }

  .context-label.positive {
    color: var(--positive);
  }

  .context-label.negative {
    color: var(--negative);
  }

  .context-label.mixed,
  .context-label.neutral {
    color: var(--amber);
  }

  .disclaimer {
    margin-top: 0.8rem;
  }

  @media (max-width: 680px) {
    .asset-title {
      align-items: flex-start;
    }

    .asset-news-actions,
    .asset-news-layout,
    .mini-tabs {
      align-items: stretch;
      display: grid;
      grid-template-columns: 1fr;
      width: 100%;
    }

    .asset-news-layout aside {
      flex-basis: auto;
    }
  }
</style>
