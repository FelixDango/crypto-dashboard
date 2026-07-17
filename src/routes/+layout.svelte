<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import {
    Activity,
    BarChart3,
    Coins,
    Eye,
    EyeOff,
    Home,
    Lightbulb,
    ListChecks,
    Newspaper,
    Settings,
    Shield
  } from '@lucide/svelte';
  import {
    initializePrivacyLevel,
    nextPrivacyLevel,
    privacyLevel,
    privacyLevelLabel,
    setPrivacyLevel
  } from '$lib/privacy/formatSensitive';

  export let data: {
    appName: string;
    settings: {
      baseCurrency: 'EUR' | 'USD';
      priceProvider: string;
    };
  };

  const nav = [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/analytics', label: 'Analytics', icon: Activity },
    { href: '/insights', label: 'Insights', icon: Lightbulb },
    { href: '/news', label: 'News', icon: Newspaper },
    { href: '/transactions', label: 'Transactions', icon: ListChecks },
    { href: '/assets', label: 'Assets', icon: Coins },
    { href: '/settings', label: 'Settings', icon: Settings }
  ];

  onMount(() => {
    initializePrivacyLevel();
  });

  function togglePrivacy() {
    setPrivacyLevel(nextPrivacyLevel($privacyLevel));
  }
</script>

<svelte:head>
  <title>{data.appName}</title>
</svelte:head>

<div class="app-shell">
  <aside class="sidebar">
    <a class="brand" href="/dashboard" aria-label={data.appName}>
      <span class="brand-mark"><BarChart3 size={20} /></span>
      <span>{data.appName}</span>
    </a>

    <nav aria-label="Primary navigation">
      {#each nav as item}
        <a
          class:active={$page.url.pathname.startsWith(item.href)}
          href={item.href}
          aria-label={item.label}
          aria-current={$page.url.pathname.startsWith(item.href) ? 'page' : undefined}
        >
          <svelte:component this={item.icon} size={18} aria-hidden="true" />
          <span>{item.label}</span>
        </a>
      {/each}
    </nav>

    <button
      class="privacy-toggle"
      type="button"
      aria-pressed={$privacyLevel !== 'off'}
      aria-label={privacyLevelLabel($privacyLevel)}
      title={privacyLevelLabel($privacyLevel)}
      on:click={togglePrivacy}
    >
      {#if $privacyLevel === 'strict'}
        <Shield size={18} />
      {:else if $privacyLevel === 'basic'}
        <EyeOff size={18} />
      {:else}
        <Eye size={18} />
      {/if}
      <span>{privacyLevelLabel($privacyLevel)}</span>
    </button>

    <div class="sidebar-footer">
      <span>{data.settings.baseCurrency}</span>
      <small>{data.settings.priceProvider}</small>
    </div>
  </aside>

  <main>
    <slot />
  </main>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(:root) {
    color-scheme: dark;
    --bg: #0c0f12;
    --bg-elevated: #11161b;
    --surface: #161b20;
    --surface-soft: #1d242a;
    --surface-strong: #222a31;
    --border: #2a343b;
    --border-strong: #3a464f;
    --text: #edf2f4;
    --muted: #99a5ad;
    --subtle: #707c84;
    --accent: #2dd4bf;
    --accent-strong: #14b8a6;
    --amber: #f59e0b;
    --blue: #60a5fa;
    --positive: #22c55e;
    --negative: #fb7185;
    --shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  }

  :global(html) {
    background: var(--bg);
  }

  :global(body) {
    background:
      linear-gradient(135deg, rgba(45, 212, 191, 0.08), transparent 34rem),
      linear-gradient(180deg, #101419 0%, var(--bg) 45%);
    color: var(--text);
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    margin: 0;
    min-height: 100vh;
    overflow-x: hidden;
  }

  :global(a) {
    color: inherit;
    text-decoration: none;
  }

  :global(button),
  :global(input),
  :global(select),
  :global(textarea) {
    font: inherit;
  }

  :global(a:focus-visible),
  :global(button:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .app-shell {
    display: grid;
    grid-template-columns: 252px minmax(0, 1fr);
    min-height: 100vh;
  }

  .sidebar {
    background: rgba(13, 17, 21, 0.86);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.1rem;
    position: sticky;
    top: 0;
    height: 100vh;
  }

  .brand {
    align-items: center;
    display: flex;
    font-weight: 800;
    gap: 0.75rem;
    min-height: 2.8rem;
  }

  .brand-mark {
    align-items: center;
    background: linear-gradient(135deg, var(--accent), var(--blue));
    border-radius: 8px;
    color: #07110f;
    display: inline-flex;
    height: 2.35rem;
    justify-content: center;
    width: 2.35rem;
  }

  nav {
    display: grid;
    gap: 0.3rem;
  }

  nav a {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--muted);
    display: flex;
    gap: 0.75rem;
    min-height: 2.65rem;
    padding: 0 0.8rem;
  }

  nav a:hover,
  nav a.active,
  .privacy-toggle:hover,
  .privacy-toggle[aria-pressed='true'] {
    background: var(--surface-soft);
    border-color: var(--border);
    color: var(--text);
  }

  .privacy-toggle {
    align-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--muted);
    cursor: pointer;
    display: flex;
    gap: 0.75rem;
    min-height: 2.65rem;
    padding: 0 0.8rem;
    text-align: left;
    width: 100%;
  }

  .sidebar-footer {
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--muted);
    display: grid;
    gap: 0.15rem;
    margin-top: auto;
    padding: 0.85rem;
  }

  .sidebar-footer span {
    color: var(--text);
    font-weight: 700;
  }

  main {
    min-width: 0;
  }

  :global(.page) {
    margin: 0 auto;
    max-width: 1440px;
    padding: 1.6rem;
  }

  :global(.page-header) {
    align-items: flex-start;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    margin-bottom: 1.4rem;
  }

  :global(.page-title) {
    display: grid;
    gap: 0.35rem;
  }

  :global(h1),
  :global(h2),
  :global(h3),
  :global(p) {
    margin: 0;
  }

  :global(h1) {
    font-size: clamp(1.8rem, 3vw, 2.55rem);
    letter-spacing: 0;
    line-height: 1.05;
  }

  :global(h2) {
    font-size: 1.05rem;
  }

  :global(.muted) {
    color: var(--muted);
  }

  :global(.grid) {
    display: grid;
    gap: 1rem;
  }

  :global(.metric-grid) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  :global(.two-column) {
    grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.8fr);
  }

  :global(.card) {
    background: rgba(22, 27, 32, 0.92);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03) inset;
    padding: 1rem;
  }

  :global(.metric-card) {
    display: grid;
    gap: 0.65rem;
    min-height: 142px;
  }

  :global(.metric-card .label) {
    color: var(--muted);
    font-size: 0.86rem;
  }

  :global(.metric-card .value) {
    font-size: clamp(1.45rem, 2.4vw, 2rem);
    font-weight: 800;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }

  :global(.metric-card .meta) {
    color: var(--subtle);
    font-size: 0.85rem;
  }

  :global(.positive) {
    color: var(--positive);
  }

  :global(.negative) {
    color: var(--negative);
  }

  :global(.neutral) {
    color: var(--muted);
  }

  :global(.btn) {
    align-items: center;
    background: var(--surface-soft);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    color: var(--text);
    cursor: pointer;
    display: inline-flex;
    gap: 0.5rem;
    justify-content: center;
    min-height: 2.55rem;
    min-width: 0;
    padding: 0 0.9rem;
  }

  :global(.btn:hover) {
    background: var(--surface-strong);
  }

  :global(.btn.primary) {
    background: var(--accent);
    border-color: var(--accent);
    color: #06100e;
    font-weight: 800;
  }

  :global(.btn.danger) {
    border-color: rgba(251, 113, 133, 0.42);
    color: var(--negative);
  }

  :global(.btn.icon) {
    min-width: 2.4rem;
    padding: 0;
  }

  :global(.table-wrap) {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: auto;
  }

  :global(table) {
    border-collapse: collapse;
    min-width: 760px;
    width: 100%;
  }

  :global(th),
  :global(td) {
    border-bottom: 1px solid var(--border);
    padding: 0.85rem 0.9rem;
    text-align: left;
    vertical-align: middle;
    white-space: nowrap;
  }

  :global(th) {
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  :global(tr:last-child td) {
    border-bottom: 0;
  }

  :global(.field-grid) {
    display: grid;
    gap: 0.8rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  :global(.field) {
    display: grid;
    gap: 0.4rem;
  }

  :global(.field.full) {
    grid-column: 1 / -1;
  }

  :global(.field-label) {
    color: var(--muted);
    font-size: 0.86rem;
  }

  :global(input),
  :global(select),
  :global(textarea) {
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    min-height: 2.75rem;
    padding: 0 0.8rem;
    width: 100%;
  }

  :global(textarea) {
    min-height: 6rem;
    padding-top: 0.75rem;
    resize: vertical;
  }

  :global(input:focus),
  :global(select:focus),
  :global(textarea:focus) {
    border-color: var(--accent);
    outline: 2px solid rgba(45, 212, 191, 0.16);
  }

  :global(.field-hint) {
    color: var(--subtle);
    font-size: 0.8rem;
  }

  :global(.empty-state) {
    align-items: center;
    display: grid;
    gap: 0.8rem;
    justify-items: start;
    min-height: 220px;
  }

  :global(.notice) {
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.28);
    border-radius: 8px;
    color: #f8d891;
    padding: 0.85rem;
  }

  :global(.modal-backdrop) {
    align-items: center;
    background: rgba(0, 0, 0, 0.68);
    display: flex;
    inset: 0;
    justify-content: center;
    padding: 1rem;
    position: fixed;
    z-index: 50;
  }

  :global(.modal) {
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    box-shadow: var(--shadow);
    max-height: 92vh;
    max-width: 720px;
    overflow: auto;
    padding: 1rem;
    width: min(720px, 100%);
  }

  :global(.modal-header),
  :global(.modal-actions) {
    align-items: center;
    display: flex;
    gap: 0.8rem;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  :global(.modal-actions) {
    justify-content: flex-end;
    margin-bottom: 0;
    margin-top: 1rem;
  }

  @media (max-width: 1180px) {
    :global(.metric-grid) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 1180px) {
    .app-shell {
      grid-template-columns: 1fr;
    }

    .sidebar {
      align-items: center;
      backdrop-filter: blur(14px);
      flex-direction: row;
      gap: 0.75rem;
      height: auto;
      overflow-x: auto;
      padding: 0.8rem max(0.85rem, env(safe-area-inset-right)) 0.8rem
        max(0.85rem, env(safe-area-inset-left));
      position: sticky;
      z-index: 30;
    }

    .brand span:last-child,
    .sidebar-footer {
      display: none;
    }

    nav {
      display: flex;
      flex: 1;
      justify-content: flex-end;
      min-width: max-content;
    }

    .privacy-toggle {
      flex: 0 0 auto;
      min-width: max-content;
      width: auto;
    }

    :global(.two-column) {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 680px) {
    .sidebar {
      gap: 0.5rem;
      padding-bottom: 0.65rem;
      padding-top: 0.65rem;
    }

    .brand,
    .brand-mark {
      min-height: 2.35rem;
    }

    .brand-mark {
      height: 2.25rem;
      width: 2.25rem;
    }

    nav {
      justify-content: space-between;
      min-width: 0;
    }

    nav a {
      justify-content: center;
      min-height: 2.4rem;
      min-width: 2.4rem;
      padding: 0;
    }

    .privacy-toggle {
      justify-content: center;
      min-height: 2.4rem;
      min-width: 2.4rem;
      padding: 0;
    }

    :global(.page) {
      padding: 0.9rem 0.85rem 1.25rem;
    }

    :global(.page-header) {
      display: grid;
      gap: 0.85rem;
      grid-template-columns: 1fr;
    }

    :global(.page-header > .btn),
    :global(.page-header .toolbar),
    :global(.page-header .toolbar .btn) {
      justify-self: stretch;
      width: 100%;
    }

    :global(.metric-grid) {
      grid-template-columns: 1fr;
    }

    :global(.card) {
      padding: 0.85rem;
    }

    :global(.field-grid) {
      grid-template-columns: 1fr;
    }

    :global(.modal-backdrop) {
      align-items: flex-start;
      overflow: auto;
      padding: 0.75rem;
    }

    :global(.modal) {
      max-height: calc(100dvh - 1.5rem);
      overflow: auto;
      padding: 0.85rem;
    }

    :global(.modal-actions) {
      background: var(--surface);
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      bottom: -0.85rem;
      padding-top: 0.75rem;
      position: sticky;
    }

    :global(.mobile-cards) {
      border: 0;
      overflow: visible;
    }

    :global(.mobile-card-table) {
      border-collapse: separate;
      border-spacing: 0;
      min-width: 0;
    }

    :global(.mobile-card-table),
    :global(.mobile-card-table thead),
    :global(.mobile-card-table tbody),
    :global(.mobile-card-table tr),
    :global(.mobile-card-table td) {
      display: block;
      width: 100%;
    }

    :global(.mobile-card-table thead) {
      height: 1px;
      margin: -1px;
      overflow: hidden;
      position: absolute;
      white-space: nowrap;
      width: 1px;
    }

    :global(.mobile-card-table tbody) {
      display: grid;
      gap: 0.75rem;
    }

    :global(.mobile-card-table tr) {
      background: rgba(22, 27, 32, 0.92);
      border: 1px solid var(--border);
      border-radius: 8px;
      display: grid;
      gap: 0.65rem;
      padding: 0.85rem;
    }

    :global(.mobile-card-table td) {
      border: 0;
      display: grid;
      gap: 0.18rem;
      padding: 0;
      white-space: normal;
    }

    :global(.mobile-card-table td::before) {
      color: var(--subtle);
      content: attr(data-label);
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    :global(.mobile-card-table td.primary-cell) {
      padding-bottom: 0.1rem;
    }

    :global(.mobile-card-table td.primary-cell::before),
    :global(.mobile-card-table td[data-label='Actions']::before) {
      display: none;
    }

    :global(.mobile-card-table .row-actions) {
      justify-content: flex-end;
    }

    :global(.mobile-card-table .notes) {
      max-width: none;
      overflow: visible;
      text-overflow: unset;
    }

    nav a span,
    .privacy-toggle span {
      display: none;
    }
  }
</style>
