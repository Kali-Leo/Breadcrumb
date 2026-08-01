/**
 * Purpose: a plain Promise-based concurrency pool for running sessions — sessions are
 * IO-bound (LLM HTTP calls), so worker_threads would add process overhead for no benefit;
 * this just bounds how many session promises are in flight and lets the cost guard veto
 * launching any further ones once the budget is exhausted.
 * Main exports: runPool.
 */

/** Runs `worker` over `items` with at most `concurrency` in flight at once. Before starting
 * each new item, `shouldStopLaunching` (if given) is checked; once it returns true, no more
 * items are started (already-running ones still finish) and their slots become `null`. */
export async function runPool<Item, Result>(
  items: readonly Item[],
  concurrency: number,
  worker: (item: Item, index: number) => Promise<Result>,
  shouldStopLaunching?: () => boolean,
): Promise<(Result | null)[]> {
  const results: (Result | null)[] = new Array(items.length).fill(null);
  let nextIndex = 0;

  async function runOne(): Promise<void> {
    for (;;) {
      if (nextIndex >= items.length || shouldStopLaunching?.() === true) return;
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index] as Item;
      results[index] = await worker(item, index);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runOne()));
  return results;
}
