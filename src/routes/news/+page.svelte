<script lang="ts">
  import {
    AlertTriangle,
    ArrowUpDown,
    CheckCircle2,
    CircleAlert,
    Clock,
    ExternalLink,
    Filter,
    Newspaper,
    RefreshCw,
    Search,
    Tags
  } from '@lucide/svelte';
  import { formatDateTime, formatPercent, signedClass } from '$lib/format';
  import type { AssetRecord } from '$lib/types';
  import type { ActionData } from './$types';
  import type { NewsArticleSort, NewsArticleSummary, NewsRange } from '$lib/server/news/context';
  import type { NewsDashboardData, NewsDashboardFilters } from '$lib/server/news/dashboard';

  export let data: {
    range: NewsRange;
    ranges: { value: NewsRange; label: string }[];
    sortOptions: { value: NewsArticleSort; label: string }[];
    filters: NewsDashboardFilters;
    contextLabels: readonly string[];
    assets: AssetRecord[];
    dashboard: NewsDashboardData;
  };
  export let form: ActionData;

  $: dashboard = data.dashboard;
  $: stats = dashboard.stats;
  $: context = dashboard.context;
  $: health = dashboard.health;
  $: articles = dashboard.articles;
  $: fallbackArticles = dashboard.fallbackArticles;
  $: sourceOptions = dashboard.sources;
  $: themeOptions = dashboard.themes;

  function statusClass(status: string): string {
    if (status === 'healthy' || status === 'success') return 'healthy';
    if (status === 'warning' || status === 'partial') return 'warning';
    if (status === 'pending') return 'pending';
    if (status === 'disabled') return 'disabled';
    return 'broken';
  }

  function statusLabel(status: string): string {
    return status.slice(0, 1).toUpperCase() + status.slice(1).replace(/-/g, ' ');
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
    return `/news?range=${data.range}&asset=${encodeURIComponent(assetId)}&matchedOnly=1`;
  }

  function assetPageHref(assetId: string): string {
    return `/assets/${encodeURIComponent(assetId)}`;
  }

  function articleThemeHref(theme: string): string {
    return `/news?range=${data.range}&theme=${encodeURIComponent(theme)}`;
  }

  function articleSourceHref(sourceId: string): string {
    return `/news?range=${data.range}&source=${encodeURIComponent(sourceId)}`;
  }

  function matchedCopy(count: number): string {
    return `${count} matched headline${count === 1 ? '' : 's'}`;
  }
</script>

<section class="page news-page">
  <div class="page-header news-header">
    <div class="page-title">
      <h1>News</h1>
      <p class="muted">Possible news context for held assets and portfolio movement.</p>
    </div>
    <div class="header-actions">
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
      <form method="POST" action="?/fetchNow">
        <button class="btn primary" type="submit">
          <RefreshCw size={17} />
          Fetch now
        </button>
      </form>
    </div>
  </div>

  {#if form?.fetchSummary}
    <section class="notice fetch-result" aria-live="polite">
      <CheckCircle2 size={17} />
      <span>
        Fetch checked {form.fetchSummary.sourcesChecked} source{form.fetchSummary.sourcesChecked ===
        1
          ? ''
          : 's'}:
        {form.fetchSummary.articlesInserted} new, {form.fetchSummary.articlesUpdated} updated,
        {form.fetchSummary.matchesCreated} matched.
      </span>
    </section>
  {:else if form?.fetchError}
    <section class="notice fetch-result error" aria-live="polite">
      <AlertTriangle size={17} />
      <span>{form.fetchError}</span>
    </section>
  {/if}

  <section class="context-strip" aria-label="Portfolio news context">
    <article class="metric-card news-metric">
      <span class="label">Portfolio move</span>
      <strong class="value">
        {#if context.portfolioMovement.available && context.portfolioMovement.percentChange !== null}
          {signedPercent(context.portfolioMovement.percentChange)}
        {:else}
          -
        {/if}
      </strong>
      <span class="meta">{context.portfolioMovement.message ?? `Over ${data.range}`}</span>
    </article>
    <article class="metric-card news-metric">
      <span class="label">Headlines in range</span>
      <strong class="value">{stats.totalArticles}</strong>
      <span class="meta">{matchedCopy(stats.matchedArticles)}</span>
    </article>
    <article class="metric-card news-metric">
      <span class="label">Dominant themes</span>
      <strong class="value">{themeOptions.length}</strong>
      <span class="meta">
        {themeOptions
          .slice(0, 2)
          .map((theme) => theme.theme)
          .join(', ') || 'No themes yet'}
      </span>
    </article>
    <article class="metric-card news-metric">
      <span class="label">Feed status</span>
      <strong class="value status-value {statusClass(health.status)}">
        {statusLabel(health.status)}
      </strong>
      <span class="meta">
        {stats.activeSources} active, {stats.sourceIssueCount} need attention
      </span>
    </article>
  </section>

  {#if health.messages.length > 0}
    <section class="feed-alerts" aria-label="News feed notes">
      {#each health.messages.slice(0, 3) as message}
        <article>
          <CircleAlert size={16} />
          <span>{message}</span>
        </article>
      {/each}
    </section>
  {/if}

  <section class="asset-desk" aria-label="Held asset news context">
    <div class="section-head">
      <div>
        <span class="eyebrow">Held assets</span>
        <h2>Asset context</h2>
      </div>
      <p>{context.disclaimer}</p>
    </div>

    {#if context.assets.length === 0}
      <div class="empty-state compact-empty">
        <p class="muted">No held asset context is available for {data.range}.</p>
      </div>
    {:else}
      <div class="asset-grid">
        {#each context.assets as asset}
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
            <div class="asset-context-meta">
              <span>{matchedCopy(asset.matchedArticleCount)}</span>
              <a href={articleAssetHref(asset.assetId)}>Open feed</a>
            </div>
            {#if asset.themes.length > 0}
              <div class="chip-row">
                {#each asset.themes.slice(0, 4) as theme}
                  <a class="chip" href={articleThemeHref(theme)}>{theme}</a>
                {/each}
              </div>
            {/if}
            {#if asset.articles.length > 0}
              <ul>
                {#each asset.articles.slice(0, 3) as article}
                  <li>
                    <a href={article.url} target="_blank" rel="noreferrer">{article.title}</a>
                    <small>{article.source}</small>
                  </li>
                {/each}
              </ul>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <form class="filters card" method="GET">
    <input type="hidden" name="range" value={data.range} />
    <div class="filter-title">
      <Filter size={18} />
      <h2>Headline workbench</h2>
    </div>
    <label class="search-field">
      <span>Search</span>
      <div class="input-with-icon">
        <Search class="search-icon" size={17} />
        <input name="q" value={data.filters.q} placeholder="Headline, source, theme, asset" />
      </div>
    </label>
    <label>
      <span>Asset</span>
      <select name="asset">
        <option value="">All assets</option>
        {#each data.assets as asset}
          <option value={asset.id} selected={data.filters.assetId === asset.id}>
            {asset.symbol} / {asset.name}
          </option>
        {/each}
      </select>
    </label>
    <label>
      <span>Source</span>
      <select name="source">
        <option value="">All sources</option>
        {#each sourceOptions as source}
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
        {#each themeOptions as theme}
          <option value={theme.theme} selected={data.filters.theme === theme.theme}>
            {theme.theme}
          </option>
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
    <label>
      <span>Sort</span>
      <select name="sort">
        {#each data.sortOptions as sort}
          <option value={sort.value} selected={data.filters.sort === sort.value}>
            {sort.label}
          </option>
        {/each}
      </select>
    </label>
    <label class="toggle-field">
      <input type="checkbox" name="matchedOnly" value="1" checked={data.filters.matchedOnly} />
      <span>Matched only</span>
    </label>
    <button class="btn primary" type="submit">Apply</button>
  </form>

  <div class="main-grid">
    <section class="headline-section">
      <div class="section-head section-spaced">
        <div>
          <span class="eyebrow">Latest fetched articles</span>
          <h2>{articles.length} headline{articles.length === 1 ? '' : 's'}</h2>
        </div>
        <span class="muted latest-note">
          <Clock size={15} />
          Latest {formatDateTime(stats.latestArticleAt)}
        </span>
      </div>

      {#if articles.length === 0}
        <div class="empty-state news-empty">
          {#if !stats.fetchHasRun}
            <Newspaper size={24} />
            <div>
              <h3>No news fetch has run yet.</h3>
              <p class="muted">
                Fetch public RSS sources now, then this page will group headlines around held
                assets.
              </p>
            </div>
            <form method="POST" action="?/fetchNow">
              <button class="btn primary" type="submit">
                <RefreshCw size={17} />
                Fetch now
              </button>
            </form>
          {:else if fallbackArticles.length > 0}
            <Newspaper size={24} />
            <div>
              <h3>No headlines match these filters.</h3>
              <p class="muted">
                Showing latest general headlines below. No causation is inferred from these items.
              </p>
            </div>
          {:else}
            <Newspaper size={24} />
            <div>
              <h3>No articles in this range.</h3>
              <p class="muted">Try a wider range or fetch the feeds again.</p>
            </div>
          {/if}
        </div>
      {/if}

      {#if fallbackArticles.length > 0}
        <div class="fallback-list">
          {#each fallbackArticles as article}
            <article class="article-card fallback">
              <div class="article-meta">
                <a href={articleSourceHref(article.sourceId)}>{article.source}</a>
                <span>{formatDateTime(articleTimestamp(article))}</span>
              </div>
              <h3>
                <a href={article.url} target="_blank" rel="noreferrer">
                  {article.title}
                  <ExternalLink size={15} />
                </a>
              </h3>
            </article>
          {/each}
        </div>
      {/if}

      {#if articles.length > 0}
        <div class="article-list">
          {#each articles as article}
            <article class="article-card">
              <div class="article-main">
                <div class="article-meta">
                  <a href={articleSourceHref(article.sourceId)}>{article.source}</a>
                  <span>{formatDateTime(articleTimestamp(article))}</span>
                  <span class="label-chip {article.sentimentLabel}">
                    {statusLabel(article.sentimentLabel)}
                  </span>
                  {#if article.matchedAssets.length === 0}
                    <span class="label-chip unmatched">Unmatched</span>
                  {/if}
                </div>
                <h3>
                  <a href={article.url} target="_blank" rel="noreferrer">
                    {article.title}
                    <ExternalLink size={15} />
                  </a>
                </h3>
                {#if article.summary}
                  <p>{article.summary}</p>
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

    <aside class="side-desk">
      <section>
        <div class="section-head section-spaced">
          <div>
            <span class="eyebrow">Themes</span>
            <h2>Range signals</h2>
          </div>
          <Tags size={18} />
        </div>
        {#if themeOptions.length === 0}
          <p class="muted compact-note">Themes appear after articles are fetched.</p>
        {:else}
          <div class="theme-list">
            {#each themeOptions.slice(0, 8) as theme}
              <a href={articleThemeHref(theme.theme)}>
                <span>{theme.theme}</span>
                <strong>{theme.matchedArticles}/{theme.articles}</strong>
              </a>
            {/each}
          </div>
        {/if}
      </section>

      <section>
        <div class="section-head section-spaced">
          <div>
            <span class="eyebrow">Sources</span>
            <h2>Source desk</h2>
          </div>
          <ArrowUpDown size={18} />
        </div>
        <div class="source-list">
          {#each sourceOptions as source}
            <article>
              <div class="source-row-head">
                <a href={articleSourceHref(source.id)}>{source.name}</a>
                <span class="status compact {statusClass(source.status)}">
                  {statusLabel(source.status)}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Range</dt>
                  <dd>{source.articlesInRange} total / {source.matchedArticlesInRange} matched</dd>
                </div>
                <div>
                  <dt>Last success</dt>
                  <dd>{formatDateTime(source.lastSuccessAt)}</dd>
                </div>
              </dl>
              {#if source.lastError}
                <p>{source.lastError}</p>
              {/if}
            </article>
          {/each}
        </div>
      </section>

      <section>
        <div class="section-head section-spaced">
          <div>
            <span class="eyebrow">Fetch events</span>
            <h2>Recent runs</h2>
          </div>
          <RefreshCw size={18} />
        </div>
        {#if dashboard.fetchEvents.length === 0}
          <p class="muted compact-note">No fetch events recorded yet.</p>
        {:else}
          <div class="event-list">
            {#each dashboard.fetchEvents as event}
              <article>
                <div>
                  <strong>{event.sourceName ?? 'Unknown source'}</strong>
                  <span class="status compact {statusClass(event.status)}">
                    {statusLabel(event.status)}
                  </span>
                </div>
                <small>
                  {formatDateTime(event.finishedAt)} / found {event.articlesFound}, new
                  {event.articlesInserted}, updated {event.articlesUpdated}
                </small>
                {#if event.errorMessage}
                  <p>{event.errorMessage}</p>
                {/if}
              </article>
            {/each}
          </div>
        {/if}
      </section>
    </aside>
  </div>
</section>

<style>
  .news-page {
    display: grid;
    gap: 1rem;
  }

  .news-header,
  .header-actions,
  .range-tabs,
  .section-head,
  .feed-alerts article,
  .filter-title,
  .article-meta,
  .chip-row,
  .latest-note,
  .asset-context-head,
  .asset-context-meta,
  .source-row-head,
  .event-list article div {
    align-items: center;
    display: flex;
  }

  .news-header,
  .section-head,
  .asset-context-head,
  .source-row-head,
  .event-list article div {
    justify-content: space-between;
  }

  .header-actions {
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .range-tabs {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    gap: 0.2rem;
    padding: 0.2rem;
  }

  .range-tabs a {
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

  .fetch-result {
    align-items: center;
    display: flex;
    gap: 0.55rem;
  }

  .fetch-result.error {
    background: rgba(251, 113, 133, 0.12);
    border-color: rgba(251, 113, 133, 0.3);
    color: #fecdd3;
  }

  .context-strip {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .news-metric {
    min-height: 118px;
  }

  .status-value {
    font-size: clamp(1.2rem, 2vw, 1.55rem);
  }

  .feed-alerts {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .feed-alerts article {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.24);
    border-radius: 8px;
    color: #f8d891;
    gap: 0.5rem;
    min-height: 3rem;
    padding: 0.65rem 0.75rem;
  }

  .asset-desk,
  .headline-section,
  .side-desk section {
    display: grid;
    gap: 0.75rem;
  }

  .section-head p {
    color: var(--muted);
    font-size: 0.82rem;
    max-width: 36rem;
    text-align: right;
  }

  .section-spaced {
    margin-bottom: 0.1rem;
  }

  .eyebrow {
    color: var(--muted);
    font-size: 0.82rem;
  }

  .asset-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .asset-context-card,
  .article-card,
  .source-list article,
  .event-list article,
  .theme-list a {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .asset-context-card,
  .article-card,
  .source-list article,
  .event-list article {
    display: grid;
    gap: 0.65rem;
    padding: 0.85rem;
  }

  .asset-context-head a {
    display: grid;
    gap: 0.1rem;
  }

  .asset-context-head a span,
  .article-meta,
  .asset-context-card small,
  .source-list dt,
  .source-list dd,
  .event-list small,
  .compact-note {
    color: var(--muted);
    font-size: 0.78rem;
  }

  .asset-context-card p,
  .article-card p,
  .source-list p,
  .event-list p {
    color: var(--muted);
    line-height: 1.45;
  }

  .asset-context-meta {
    color: var(--muted);
    font-size: 0.78rem;
    gap: 0.55rem;
    justify-content: space-between;
  }

  .asset-context-meta a,
  .article-card h3 a:hover,
  .article-meta a:hover,
  .asset-context-card a:hover,
  .theme-list a:hover,
  .source-list a:hover {
    color: var(--accent);
  }

  .asset-context-card ul {
    display: grid;
    gap: 0.5rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .asset-context-card li {
    display: grid;
    gap: 0.15rem;
    line-height: 1.35;
  }

  .filters {
    align-items: end;
    display: grid;
    gap: 0.75rem;
    grid-template-columns: minmax(180px, 1.2fr) repeat(5, minmax(120px, 1fr)) auto auto;
  }

  .filter-title {
    gap: 0.4rem;
    grid-column: 1 / -1;
  }

  .filters label {
    display: grid;
    gap: 0.35rem;
  }

  .filters label span {
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .input-with-icon {
    position: relative;
  }

  .search-icon {
    color: var(--muted);
    left: 0.75rem;
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
  }

  .input-with-icon input {
    padding-left: 2.25rem;
  }

  .toggle-field {
    align-items: center;
    display: flex !important;
    gap: 0.5rem !important;
    min-height: 2.75rem;
  }

  .toggle-field input {
    height: 1rem;
    min-height: 0;
    width: 1rem;
  }

  .toggle-field span {
    color: var(--text) !important;
    text-transform: none !important;
  }

  .main-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
  }

  .latest-note {
    gap: 0.35rem;
  }

  .article-list,
  .fallback-list,
  .source-list,
  .event-list,
  .theme-list {
    display: grid;
    gap: 0.75rem;
  }

  .article-main {
    display: grid;
    gap: 0.5rem;
  }

  .article-meta {
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .article-meta span:not(:last-child)::after,
  .article-meta a::after {
    color: var(--subtle);
    content: '/';
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

  .fallback {
    opacity: 0.86;
  }

  .chip-row {
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .chip,
  .label-chip,
  .status {
    border: 1px solid var(--border);
    border-radius: 999px;
    display: inline-flex;
    font-size: 0.74rem;
    font-weight: 800;
  }

  .chip,
  .label-chip {
    color: var(--muted);
    padding: 0.16rem 0.48rem;
  }

  .asset-chip {
    color: var(--accent);
  }

  .status {
    align-items: center;
    font-size: 0.8rem;
    gap: 0.35rem;
    min-height: 1.8rem;
    padding: 0 0.65rem;
  }

  .status.compact {
    font-size: 0.72rem;
    min-height: 1.45rem;
    padding: 0 0.5rem;
  }

  .healthy,
  .label-chip.positive {
    color: var(--positive);
  }

  .warning,
  .label-chip.mixed,
  .label-chip.neutral {
    color: var(--amber);
  }

  .pending {
    color: var(--blue);
  }

  .broken,
  .label-chip.negative {
    color: var(--negative);
  }

  .disabled,
  .label-chip.unknown,
  .label-chip.unmatched {
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

  .status.pending {
    background: rgba(96, 165, 250, 0.1);
    border-color: rgba(96, 165, 250, 0.3);
  }

  .status.broken {
    background: rgba(251, 113, 133, 0.1);
    border-color: rgba(251, 113, 133, 0.3);
  }

  .source-list dl {
    display: grid;
    gap: 0.4rem;
    margin: 0;
  }

  .source-list dd {
    margin: 0.1rem 0 0;
  }

  .theme-list a {
    align-items: center;
    display: flex;
    justify-content: space-between;
    padding: 0.65rem 0.75rem;
  }

  .theme-list span {
    color: var(--muted);
  }

  .empty-state {
    background: rgba(22, 27, 32, 0.92);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .compact-empty {
    min-height: 88px;
  }

  .news-empty {
    align-items: center;
    display: flex;
    gap: 0.85rem;
    min-height: 128px;
    padding: 1rem;
  }

  @media (max-width: 1240px) {
    .context-strip,
    .asset-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .filters {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .filter-title,
    .search-field {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 980px) {
    .main-grid {
      grid-template-columns: 1fr;
    }

    .feed-alerts {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 680px) {
    .news-header,
    .header-actions,
    .section-head,
    .context-strip,
    .asset-grid,
    .filters {
      display: grid;
      grid-template-columns: 1fr;
      width: 100%;
    }

    .header-actions {
      justify-content: stretch;
    }

    .header-actions .btn,
    .header-actions form {
      width: 100%;
    }

    .range-tabs {
      display: flex;
      width: 100%;
    }

    .range-tabs a {
      flex: 1;
    }

    .section-head p {
      text-align: left;
    }

    .news-empty {
      align-items: flex-start;
      display: grid;
    }
  }
</style>
