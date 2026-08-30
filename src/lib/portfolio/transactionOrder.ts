export type OrderedTransaction = {
  id: string;
  transactionDate: string;
  createdAt: string;
};

/** Canonical ledger order: transactionDate, createdAt, then id. */
export function compareTransactions(left: OrderedTransaction, right: OrderedTransaction): number {
  const byDate = left.transactionDate.localeCompare(right.transactionDate);
  if (byDate !== 0) return byDate;

  const byCreated = left.createdAt.localeCompare(right.createdAt);
  if (byCreated !== 0) return byCreated;

  return left.id.localeCompare(right.id);
}

export function orderTransactions<T extends OrderedTransaction>(transactions: T[]): T[] {
  return [...transactions].sort(compareTransactions);
}
