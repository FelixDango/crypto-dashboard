import { describe, expect, it } from 'vitest';
import {
  formatSensitive,
  nextPrivacyLevel,
  shouldMaskSensitive
} from '../src/lib/privacy/formatSensitive';

describe('privacy formatting', () => {
  it('masks fiat values in basic mode', () => {
    expect(formatSensitive('EUR 12,345.00', { level: 'basic', kind: 'fiat' })).toBe('•••••');
  });

  it('keeps percentages visible', () => {
    expect(formatSensitive('+42.80%', { level: 'strict', kind: 'percentage' })).toBe('+42.80%');
  });

  it('hides quantities only in strict mode', () => {
    expect(shouldMaskSensitive('basic', 'quantity')).toBe(false);
    expect(shouldMaskSensitive('strict', 'quantity')).toBe(true);
  });

  it('cycles privacy levels predictably', () => {
    expect(nextPrivacyLevel('off')).toBe('basic');
    expect(nextPrivacyLevel('basic')).toBe('strict');
    expect(nextPrivacyLevel('strict')).toBe('off');
  });
});
