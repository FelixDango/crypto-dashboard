let mutationQueue: Promise<void> = Promise.resolve();

export function serializePortfolioMutation<T>(task: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(task, task);
  mutationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
