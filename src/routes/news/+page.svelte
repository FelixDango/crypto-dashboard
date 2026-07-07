<script lang="ts">
  import {
    AlertTriangle,
    CheckCircle2,
    CircleAlert,
    ExternalLink,
    Filter,
    Newspaper
  } from '@lucide/svelte';
  import { formatDateTime, formatPercent, signedClass } from '$lib/format';
  import type { AssetRecord } from '$lib/types';
  import type {
    NewsArticleSummary,
    NewsRange,
    PortfolioNewsContext
  } from '$lib/server/news/context';
  import type { NewsHealth, NewsSourceHealth } from '$lib/server/news/health';

  export let data: {
    range: NewsRange;
    ranges: { value: NewsRange; label: string }[];
    filters: {
      assetId: string;
      sourceId: string;
      theme: string;
      sentimentLabel: string;
    };
    contextLabels: readonly string[];
    themes: string[];
    assets: AssetRecord[];
    health: NewsHealth;
    sources: NewsSourceHealth[];
    articles: NewsArticleSummary[];
    context: PortfolioNewsContext;
  };

  function statusClass(status: string): string {
    if (status === 'healthy') return 'healthy';
    if (status === 'warning') return 'warning';
    if (status === 'disabled') return 'disabled';
    return 'broken';
  }

  function statusLabel(status: string): string {
    return status.slice(0, 1).toUpperCase() + status.slice(1);
  }

  function articleTimestamp(article: NewsArticleSummary): string {
    return article.publishedAt ?? article.fetchedAt;
  }

  function signedPercent(value: number | null): string {
    if (value === null) return '-';
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${formatPercent(value)}`;
  }

  function articleAssetHref(assetId: string): string {
    return `/news?range=${data.range}&asset=${encodeURIComponent(assetId)}`;
  }

  function assetPageHref(assetId: string): string {
    return `/assets/${encodeURIComponent(assetId)}`;
  }

  function articleThemeHref(theme: string): string {
    return `/news?range=${data.range}&theme=${encodeURIComponent(theme)}`;
  }
</script>

<section class="page news-page">
  <div class="page-header">
    <div class="page-title">
      <h1>News</h1>
      <p class="muted">Possible news context for held assets and portfolio movement.</p>
    </div>
    <div class="range-tabs" aria-label="News range">
      {#each data.ranges as range}
        <a
          class:active={data.range === range.value}
          href={`/news?range=${range.value}`}
          aria-current={data.range === range.value ? 'page' : undefined}
        >
          {range.label}
        </a>
      {/each}
    </div>
  </div>

  <div class="grid health-grid">
    <section class="card health-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">News health</span>
          <h2>Fetch status</h2>
        </div>
        <span class="status {statusClass(data.health.status)}">
          {#if data.health.status === 'healthy'}
            <CheckCircle2 size={16} />
          {:else if data.health.status === 'warning'}
            <CircleAlert size={16} />
          {:else}
            <AlertTriangle size={16} />
          {/if}
          {statusLabel(data.health.status)}
        </span>
      </div>
      <div class="health-stats">
        <article>
          <span>Last success</span>
          <strong>{formatDateTime(data.health.latestSuccessfulFetchAt)}</strong>
        </article>
        <article>
          <span>Enabled sources</span>
          <strong>{data.health.enabledSources}</strong>
        </article>
        <article>
          <span>Fetched 24h</span>
          <strong>{data.health.articlesFetchedLast24h}</strong>
        </article>
        <article>
          <span>Matched 24h</span>
          <strong>{data.health.matchedArticlesLast24h}</strong>
        </article>
      </div>
      {#if data.health.messages.length > 0}
        <ul class="message-list">
          {#each data.health.messages.slice(0, 4) as message}
            <li>{message}</li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="card context-card">
      <div class="section-head">
        <div>
          <span class="eyebrow">Possible news context</span>
          <h2>{data.range} portfolio movement</h2>
        </div>
        <Newspaper size={20} />
      </div>
      <p class="summary-line">
        {#if data.context.portfolioMovement.available && data.context.portfolioMovement.percentChange !== null}
          Portfolio is {signedPercent(data.context.portfolioMovement.percentChange)} over {data.range}.
        {:else}
          {data.context.portfolioMovement.message ?? `Not enough ${data.range} history yet.`}
        {/if}
      </p>
      <p class="disclaimer">{data.context.disclaimer}</p>
    </section>
  </div>

  <section class="source-grid" aria-label="News sources">
    {#each data.sources as source}
      <article class="source-card">
        <div>
          <span class="source-name">{source.name}</span>
          <small>{source.type.toUpperCase()} · every {source.fetchIntervalMinutes}m</small>
        </div>
        <span class="status compact {statusClass(source.status)}">{statusLabel(source.status)}</span
        >
        <dl>
          <div>
            <dt>Fetched</dt>
            <dd>{formatDateTime(source.lastFetchedAt)}</dd>
          </div>
          <div>
            <dt>Success</dt>
            <dd>{formatDateTime(source.lastSuccessAt)}</dd>
          </div>
        </dl>
        {#if source.lastError}
          <p class="source-error">{source.lastError}</p>
        {/if}
      </article>
    {/each}
  </section>

  <form class="card filters" method="GET">
    <input type="hidden" name="range" value={data.range} />
    <div class="filter-head">
      <Filter size={18} />
      <h2>Filters</h2>
    </div>
    <label>
      <span>Asset</span>
      <select name="asset">
        <option value="">All assets</option>
        {#each data.assets as asset}
          <option value={asset.id} selected={data.filters.assetId === asset.id}>
            {asset.symbol} · {asset.name}
          </option>
        {/each}
      </select>
    </label>
    <label>
      <span>Source</span>
      <select name="source">
        <option value="">All sources</option>
        {#each data.sources as source}
          <option value={source.id} selected={data.filters.sourceId === source.id}>
            {source.name}
          </option>
        {/each}
      </select>
    </label>
    <label>
      <span>Theme</span>
      <select name="theme">
        <option value="">All themes</option>
        {#each data.themes as theme}
          <option value={theme} selected={data.filters.theme === theme}>{theme}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Context label</span>
      <select name="contextLabel">
        <option value="">All labels</option>
        {#each data.contextLabels as label}
          <option value={label} selected={data.filters.sentimentLabel === label}>
            {statusLabel(label)}
          </option>
        {/each}
      </select>
    </label>
    <button class="btn primary" type="submit">Apply</button>
  </form>

  <div class="grid content-grid">
    <section class="article-section">
      <div class="section-head section-spaced">
        <div>
          <span class="eyebrow">Latest fetched articles</span>
          <h2>{data.articles.length} headline{data.articles.length === 1 ? '' : 's'}</h2>
        </div>
      </div>
      {#if data.articles.length === 0}
        <div class="card empty-state compact-empty">
          <p class="muted">No articles match these filters.</p>
        </div>
      {:else}
        <div class="article-list">
          {#each data.articles as article}
            <article class="article-card">
              <div class="article-main">
                <div class="article-meta">
                  <span>{article.source}</span>
                  <span>{formatDateTime(articleTimestamp(article))}</span>
                  <span class="label-chip {article.sentimentLabel}">
                    {statusLabel(article.sentimentLabel)}
                  </span>
                </div>
                <h3>
                  <a href={article.url} target="_blank" rel="noreferrer">
                    {article.title}
                    <ExternalLink size={15} />
                  </a>
                </h3>
                {#if article.summary}
                  <p class="article-summary">{article.summary}</p>
                {/if}
                <div class="chip-row">
                  {#each article.matchedAssets as asset}
                    <a class="chip asset-chip" href={articleAssetHref(asset.assetId)}>
                      {asset.symbol}
                    </a>
                  {/each}
                  {#each article.themes as theme}
                    <a class="chip" href={articleThemeHref(theme)}>{theme}</a>
                  {/each}
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    <section class="context-section">
      <div class="section-head section-spaced">
        <div>
          <span class="eyebrow">Asset-context grouping</span>
          <h2>Held assets</h2>
        </div>
      </div>
      {#if data.context.assets.length === 0}
        <div class="card empty-state compact-empty">
          <p class="muted">No held asset context is available for {data.range}.</p>
        </div>
      {:else}
        <div class="asset-context-list">
          {#each data.context.assets as asset}
            <article class="asset-context-card">
              <div class="asset-context-head">
                <a href={assetPageHref(asset.assetId)}>
                  <strong>{asset.symbol}</strong>
                  <span>{asset.name}</span>
                </a>
                <span class={signedClass(asset.priceChangePercent ?? 0)}>
                  {signedPercent(asset.priceChangePercent)}
                </span>
              </div>
              <p>{asset.contextSummary}</p>
              <div class="chip-row">
                {#each asset.themes as theme}
                  <a class="chip" href={articleThemeHref(theme)}>{theme}</a>
                {/each}
              </div>
              <ul>
                {#each asset.articles.slice(0, 4) as article}
                  <li>
                    <a href={article.url} target="_blank" rel="noreferrer">{article.title}</a>
                    <small>{article.source}</small>
                  </li>
                {/each}
              </ul>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</section>

<style>
  .news-page {
    display: grid;
    gap: 1rem;
  }

  .range-tabs {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    gap: 0.2rem;
    padding: 0.2rem;
  }

  .range-tabs a {
    align-items: center;
    border-radius: 6px;
    color: var(--muted);
    display: inline-flex;
    font-size: 0.82rem;
    font-weight: 800;
    justify-content: center;
    min-height: 2rem;
    min-width: 2.6rem;
    padding: 0 0.55rem;
  }

  .range-tabs a:hover,
  .range-tabs a.active {
    background: var(--surface-strong);
    color: var(--text);
  }

  .health-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
  }

  .health-card,
  .context-card {
    display: grid;
    gap: 0.85rem;
  }

  .section-head,
  .filter-head,
  .article-meta,
  .chip-row,
  .asset-context-head {
    align-items: center;
    display: flex;
  }

  .section-head,
  .asset-context-head {
    justify-content: space-between;
  }

  .section-spaced {
    margin-bottom: 0.8rem;
  }

  .eyebrow {
    color: var(--muted);
    font-size: 0.82rem;
  }

  .summary-line {
    font-size: 1.05rem;
    font-weight: 800;
  }

  .disclaimer {
    color: var(--muted);
    line-height: 1.45;
  }

  .status {
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 999px;
    display: inline-flex;
    font-size: 0.8rem;
    font-weight: 800;
    gap: 0.35rem;
    min-height: 1.8rem;
    padding: 0 0.65rem;
  }

  .status.compact {
    font-size: 0.72rem;
    min-height: 1.5rem;
    padding: 0 0.5rem;
  }

  .healthy {
    color: var(--positive);
  }

  .warning {
    color: var(--amber);
  }

  .broken {
    color: var(--negative);
  }

  .disabled {
    color: var(--subtle);
  }

  .status.healthy {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.28);
  }

  .status.warning {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.3);
  }

  .status.broken {
    background: rgba(251, 113, 133, 0.1);
    border-color: rgba(251, 113, 133, 0.3);
  }

  .health-stats {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .health-stats article,
  .source-card,
  .article-card,
  .asset-context-card {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.85rem;
  }

  .health-stats article {
    display: grid;
    gap: 0.25rem;
  }

  .health-stats span,
  .source-card small,
  .source-card dt,
  .article-meta,
  .asset-context-card small {
    color: var(--muted);
    font-size: 0.78rem;
  }

  .message-list {
    color: var(--muted);
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding-left: 1.1rem;
  }

  .source-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .source-card {
    display: grid;
    gap: 0.65rem;
  }

  .source-card dl {
    display: grid;
    gap: 0.45rem;
    margin: 0;
  }

  .source-card dd {
    margin: 0.1rem 0 0;
  }

  .source-name {
    display: block;
    font-weight: 800;
  }

  .source-error {
    color: var(--amber);
    font-size: 0.78rem;
    line-height: 1.35;
  }

  .filters {
    align-items: end;
    display: grid;
    gap: 0.75rem;
    grid-template-columns: auto repeat(4, minmax(140px, 1fr)) auto;
  }

  .filter-head {
    gap: 0.4rem;
    min-height: 2.75rem;
  }

  .filters label {
    display: grid;
    gap: 0.35rem;
  }

  .filters label span {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .content-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(340px, 0.65fr);
  }

  .article-list,
  .asset-context-list {
    display: grid;
    gap: 0.75rem;
  }

  .article-card,
  .asset-context-card {
    display: grid;
    gap: 0.7rem;
  }

  .article-main {
    display: grid;
    gap: 0.5rem;
  }

  .article-meta {
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .article-meta span:not(:last-child)::after {
    color: var(--subtle);
    content: '·';
    margin-left: 0.45rem;
  }

  .article-card h3 {
    font-size: 1rem;
    line-height: 1.35;
  }

  .article-card h3 a {
    align-items: center;
    display: inline-flex;
    gap: 0.35rem;
  }

  .article-card h3 a:hover,
  .asset-context-card a:hover {
    color: var(--accent);
  }

  .article-summary,
  .asset-context-card p {
    color: var(--muted);
    line-height: 1.45;
  }

  .chip-row {
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .chip,
  .label-chip {
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 800;
    padding: 0.16rem 0.48rem;
  }

  .asset-chip {
    color: var(--accent);
  }

  .label-chip.positive {
    color: var(--positive);
  }

  .label-chip.negative {
    color: var(--negative);
  }

  .label-chip.mixed,
  .label-chip.neutral {
    color: var(--amber);
  }

  .asset-context-head a {
    display: grid;
    gap: 0.1rem;
  }

  .asset-context-head a span {
    color: var(--muted);
    font-size: 0.8rem;
  }

  .asset-context-card ul {
    display: grid;
    gap: 0.55rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .asset-context-card li {
    display: grid;
    gap: 0.15rem;
    line-height: 1.35;
  }

  .compact-empty {
    min-height: 92px;
  }

  @media (max-width: 1180px) {
    .source-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .filters {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .filter-head,
    .filters .btn {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 980px) {
    .health-grid,
    .content-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 680px) {
    .range-tabs,
    .source-grid,
    .health-stats,
    .filters {
      grid-template-columns: 1fr;
      width: 100%;
    }

    .range-tabs {
      display: flex;
    }
  }
</style>
