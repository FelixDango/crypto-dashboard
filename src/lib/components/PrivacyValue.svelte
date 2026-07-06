<script lang="ts">
  import {
    formatSensitive,
    privacyLevel,
    shouldMaskSensitive,
    type SensitiveValueKind
  } from '$lib/privacy/formatSensitive';

  export let value = '';
  export let kind: SensitiveValueKind = 'fiat';
  export let className = '';
  export let mask = '•••••';

  $: masked = shouldMaskSensitive($privacyLevel, kind);
  $: displayValue = formatSensitive(value, { level: $privacyLevel, kind, mask });
</script>

<span
  class={className}
  class:privacy-mask={masked}
  aria-label={masked ? 'Hidden value' : undefined}
>
  {displayValue}
</span>

<style>
  .privacy-mask {
    color: var(--muted);
    display: inline-block;
    font-weight: 800;
    min-width: 3.4rem;
  }
</style>
