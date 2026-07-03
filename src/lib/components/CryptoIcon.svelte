<script lang="ts">
  export let src: string | null | undefined = null;
  export let symbol = '';
  export let name = '';
  export let size = 30;

  let failed = false;
  let previousSrc: string | null | undefined = src;

  $: if (src !== previousSrc) {
    failed = false;
    previousSrc = src;
  }

  $: label = (symbol || name || '?').trim().slice(0, 4).toUpperCase();
  $: imageSrc = src && !failed ? proxiedIconUrl(src) : null;

  function proxiedIconUrl(value: string): string {
    if (value.startsWith('/') || value.startsWith('data:')) return value;
    return `/api/assets/icon?url=${encodeURIComponent(value)}`;
  }
</script>

<span class="crypto-icon" style={`--icon-size: ${size}px`} aria-hidden="true">
  {#if imageSrc}
    <img src={imageSrc} alt="" loading="lazy" decoding="async" on:error={() => (failed = true)} />
  {:else}
    <span>{label}</span>
  {/if}
</span>

<style>
  .crypto-icon {
    align-items: center;
    background: linear-gradient(135deg, rgba(45, 212, 191, 0.22), rgba(96, 165, 250, 0.2));
    border: 1px solid var(--border-strong);
    border-radius: 50%;
    color: var(--text);
    display: inline-flex;
    flex: 0 0 auto;
    font-size: calc(var(--icon-size) * 0.28);
    font-weight: 800;
    height: var(--icon-size);
    justify-content: center;
    line-height: 1;
    overflow: hidden;
    width: var(--icon-size);
  }

  .crypto-icon img {
    background: var(--surface-soft);
    display: block;
    height: 100%;
    object-fit: cover;
    width: 100%;
  }

  .crypto-icon span {
    max-width: 100%;
    overflow: hidden;
    padding: 0 0.12rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
