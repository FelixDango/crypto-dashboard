import { browser } from '$app/environment';
import { derived, writable } from 'svelte/store';

export type PrivacyLevel = 'off' | 'basic' | 'strict';
export type SensitiveValueKind = 'fiat' | 'quantity' | 'sensitive' | 'percentage';

export const PRIVACY_STORAGE_KEY = 'krypto-dashboard-privacy-level';

export const privacyLevel = writable<PrivacyLevel>('off');
export const privacyEnabled = derived(privacyLevel, ($privacyLevel) => $privacyLevel !== 'off');

export function normalizePrivacyLevel(value: string | null | undefined): PrivacyLevel {
  if (value === 'basic' || value === 'strict') return value;
  return 'off';
}

export function initializePrivacyLevel(): void {
  if (!browser) return;
  privacyLevel.set(normalizePrivacyLevel(window.localStorage.getItem(PRIVACY_STORAGE_KEY)));
}

export function setPrivacyLevel(level: PrivacyLevel): void {
  privacyLevel.set(level);
  if (browser) {
    window.localStorage.setItem(PRIVACY_STORAGE_KEY, level);
  }
}

export function nextPrivacyLevel(level: PrivacyLevel): PrivacyLevel {
  if (level === 'off') return 'basic';
  if (level === 'basic') return 'strict';
  return 'off';
}

export function privacyLevelLabel(level: PrivacyLevel): string {
  if (level === 'basic') return 'Privacy: fiat';
  if (level === 'strict') return 'Privacy: strict';
  return 'Privacy off';
}

export function shouldMaskSensitive(level: PrivacyLevel, kind: SensitiveValueKind): boolean {
  if (kind === 'percentage') return false;
  if (level === 'strict') return kind === 'fiat' || kind === 'quantity' || kind === 'sensitive';
  if (level === 'basic') return kind === 'fiat' || kind === 'sensitive';
  return false;
}

export function formatSensitive(
  value: string,
  options: { level: PrivacyLevel; kind?: SensitiveValueKind; mask?: string }
): string {
  const kind = options.kind ?? 'fiat';
  if (!shouldMaskSensitive(options.level, kind)) return value;
  return options.mask ?? '•••••';
}
