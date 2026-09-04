<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { BarChart3, Eye, EyeOff, ListChecks, Settings, Shield } from '@lucide/svelte';
  import {
    initializePrivacyLevel,
    nextPrivacyLevel,
    privacyLevel,
    privacyLevelLabel,
    setPrivacyLevel
  } from '$lib/privacy/formatSensitive';

  export let data: {
    appName: string;
    settings: { baseCurrency: 'EUR' | 'USD'; priceProvider: string };
  };

  const nav = [
    { href: '/dashboard', label: 'Portfolio', icon: BarChart3 },
    { href: '/transactions', label: 'Activity', icon: ListChecks },
    { href: '/settings', label: 'Settings', icon: Settings }
  ];

  onMount(() => {
    initializePrivacyLevel();
    document.documentElement.dataset.appReady = 'true';
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
      <span class="brand-mark"><BarChart3 size={21} strokeWidth={1.8} /></span>
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
          <svelte:component this={item.icon} size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>{item.label}</span>
        </a>
      {/each}
    </nav>

    <div class="sidebar-utilities">
      <button
        class="privacy-toggle"
        type="button"
        aria-pressed={$privacyLevel !== 'off'}
        aria-label={privacyLevelLabel($privacyLevel)}
        title={privacyLevelLabel($privacyLevel)}
        on:click={togglePrivacy}
      >
        {#if $privacyLevel === 'strict'}
          <Shield size={19} strokeWidth={1.8} />
        {:else if $privacyLevel === 'basic'}
          <EyeOff size={19} strokeWidth={1.8} />
        {:else}
          <Eye size={19} strokeWidth={1.8} />
        {/if}
        <span>{privacyLevelLabel($privacyLevel)}</span>
      </button>
    </div>
  </aside>

  <main><slot /></main>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(:root) {
    color-scheme: dark;
    --bg: #0b1014;
    --bg-elevated: #0f151a;
    --surface: #12191f;
    --surface-soft: #182027;
    --surface-strong: #202a32;
    --border: #263039;
    --border-strong: #36434d;
    --text: #f2f5f5;
    --muted: #9aa7b0;
    --subtle: #77848d;
    --accent: #35d6cb;
    --accent-strong: #24c4ba;
    --amber: #f0ad4e;
    --blue: #5ca8ff;
    --positive: #4ad394;
    --negative: #ff6b72;
    --shadow: 0 24px 60px rgba(0, 0, 0, 0.38);
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
  }

  :global(html),
  :global(body) {
    background: var(--bg);
  }

  :global(body) {
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
    text-rendering: optimizeLegibility;
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
  :global(button:focus-visible),
  :global(input:focus-visible),
  :global(select:focus-visible),
  :global(textarea:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  .app-shell {
    display: grid;
    grid-template-columns: 202px minmax(0, 1fr);
    min-height: 100vh;
  }

  .sidebar {
    background: var(--bg-elevated);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 2.6rem;
    height: 100vh;
    padding: 1.5rem 1rem 1.25rem;
    position: sticky;
    top: 0;
    z-index: 30;
  }

  .brand {
    align-items: center;
    display: flex;
    font-size: 0.96rem;
    font-weight: 750;
    gap: 0.65rem;
    letter-spacing: -0.01em;
    min-height: 2.6rem;
    padding: 0 0.55rem;
  }

  .brand-mark {
    align-items: center;
    color: var(--accent);
    display: inline-flex;
    height: 2rem;
    justify-content: center;
    width: 2rem;
  }

  nav {
    display: grid;
    gap: 0.35rem;
  }

  nav a {
    align-items: center;
    border-radius: var(--radius-sm);
    color: var(--muted);
    display: flex;
    gap: 0.8rem;
    min-height: 3.45rem;
    padding: 0 0.85rem;
    transition:
      background 120ms ease,
      color 120ms ease;
  }

  nav a:hover,
  nav a.active,
  .privacy-toggle:hover,
  .privacy-toggle[aria-pressed='true'] {
    background: var(--surface-soft);
    color: var(--text);
  }

  nav a.active {
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .sidebar-utilities {
    display: grid;
    gap: 0.75rem;
    margin-top: auto;
  }

  .privacy-toggle {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--muted);
    cursor: pointer;
    display: flex;
    gap: 0.8rem;
    min-height: 2.9rem;
    padding: 0 0.75rem;
    text-align: left;
    width: 100%;
  }

  main {
    min-width: 0;
  }

  :global(.page) {
    margin: 0 auto;
    max-width: 1500px;
    padding: 2.5rem clamp(1.5rem, 3vw, 3.25rem) 3rem;
  }

  :global(.page-header) {
    align-items: flex-start;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    margin-bottom: 1.75rem;
  }

  :global(.page-title) {
    display: grid;
    gap: 0.4rem;
  }

  :global(h1),
  :global(h2),
  :global(h3),
  :global(p) {
    margin: 0;
  }

  :global(h1) {
    font-size: clamp(1.8rem, 2.6vw, 2.4rem);
    font-weight: 760;
    letter-spacing: -0.035em;
    line-height: 1.1;
  }

  :global(h2) {
    font-size: 1.05rem;
    letter-spacing: -0.015em;
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
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 1.15rem;
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
    font-weight: 760;
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
    border-radius: var(--radius-sm);
    color: var(--text);
    cursor: pointer;
    display: inline-flex;
    font-size: 0.9rem;
    gap: 0.5rem;
    justify-content: center;
    min-height: 2.7rem;
    min-width: 0;
    padding: 0 0.95rem;
    transition:
      background 120ms ease,
      border-color 120ms ease,
      transform 120ms ease;
  }

  :global(.btn:hover) {
    background: var(--surface-strong);
    border-color: #465561;
  }

  :global(.btn:active) {
    transform: translateY(1px);
  }

  :global(.btn:disabled) {
    cursor: not-allowed;
    opacity: 0.55;
  }

  :global(.btn.primary) {
    background: var(--accent);
    border-color: var(--accent);
    color: #061312;
    font-weight: 760;
  }

  :global(.btn.primary:hover) {
    background: #55e0d7;
    border-color: #55e0d7;
  }

  :global(.btn.danger) {
    border-color: rgba(255, 107, 114, 0.4);
    color: var(--negative);
  }

  :global(.btn.icon) {
    min-width: 2.7rem;
    padding: 0;
  }

  :global(.table-wrap) {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
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
    padding: 0.9rem 1rem;
    text-align: left;
    vertical-align: middle;
    white-space: nowrap;
  }

  :global(th) {
    color: var(--muted);
    font-size: 0.76rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  :global(tr:last-child td) {
    border-bottom: 0;
  }

  :global(.field-grid) {
    display: grid;
    gap: 0.85rem;
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
    border-radius: var(--radius-sm);
    color: var(--text);
    min-height: 2.8rem;
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
    min-height: 210px;
  }

  :global(.notice) {
    background: rgba(240, 173, 78, 0.1);
    border: 1px solid rgba(240, 173, 78, 0.3);
    border-radius: var(--radius-sm);
    color: #f2cf91;
    padding: 0.9rem;
  }

  :global(.modal-backdrop) {
    align-items: center;
    background: rgba(0, 0, 0, 0.72);
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
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    max-height: 92vh;
    max-width: 720px;
    overflow: auto;
    padding: 1.25rem;
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

    :global(.two-column) {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 900px) {
    .app-shell {
      grid-template-columns: 1fr;
    }

    .sidebar {
      align-items: center;
      border-bottom: 1px solid var(--border);
      border-right: 0;
      flex-direction: row;
      gap: 1rem;
      height: 4.25rem;
      justify-content: space-between;
      padding: 0.65rem 1rem;
    }

    .brand {
      padding: 0;
    }

    .sidebar nav {
      background: var(--bg-elevated);
      border-top: 1px solid var(--border);
      bottom: 0;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      left: 0;
      padding: 0.45rem max(0.75rem, env(safe-area-inset-right))
        calc(0.45rem + env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
      position: fixed;
      right: 0;
      z-index: 40;
    }

    .sidebar nav a {
      display: grid;
      font-size: 0.72rem;
      gap: 0.15rem;
      justify-items: center;
      min-height: 3.4rem;
      padding: 0.35rem;
    }

    .sidebar nav a.active {
      box-shadow: inset 0 2px 0 var(--accent);
    }

    .sidebar-utilities {
      margin: 0;
    }

    .privacy-toggle {
      justify-content: center;
      min-width: 2.75rem;
      padding: 0;
      width: 2.75rem;
    }

    .privacy-toggle span {
      display: none;
    }

    main {
      padding-bottom: calc(4.5rem + env(safe-area-inset-bottom));
    }
  }

  @media (max-width: 680px) {
    .brand span:last-child {
      font-size: 0.9rem;
    }

    :global(.page) {
      padding: 1.35rem 1rem 2rem;
    }

    :global(.page-header) {
      display: grid;
      gap: 1rem;
      grid-template-columns: 1fr;
    }

    :global(.page-header > .btn),
    :global(.page-header .toolbar),
    :global(.page-header .toolbar .btn) {
      justify-self: stretch;
      width: 100%;
    }

    :global(.metric-grid),
    :global(.field-grid) {
      grid-template-columns: 1fr;
    }

    :global(.card) {
      padding: 1rem;
    }

    :global(.modal-backdrop) {
      align-items: flex-start;
      overflow: auto;
      padding: 0.75rem;
    }

    :global(.modal) {
      max-height: calc(100dvh - 1.5rem);
      overflow: auto;
      padding: 1rem;
    }

    :global(.modal-actions) {
      background: var(--surface);
      bottom: -1rem;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
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
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      display: grid;
      gap: 0.65rem;
      padding: 0.9rem;
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
      font-weight: 700;
      letter-spacing: 0.04em;
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
  }
</style>
