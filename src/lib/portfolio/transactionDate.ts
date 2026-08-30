/**
 * Transaction eligibility uses UTC calendar dates. The current UTC date is allowed;
 * a later UTC calendar date is future-dated, regardless of the time component.
 */
export function utcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function transactionUtcDateKey(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Transaction date is invalid.');
  return utcDateKey(parsed);
}

export function isFutureTransactionDate(value: string, now: Date = new Date()): boolean {
  return transactionUtcDateKey(value) > utcDateKey(now);
}

export function assertTransactionIsCurrent(value: string, now: Date = new Date()): void {
  if (isFutureTransactionDate(value, now)) {
    throw new Error('Transaction date cannot be later than today (UTC).');
  }
}
