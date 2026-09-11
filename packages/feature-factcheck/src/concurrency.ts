/**
 * Purpose: bounded-concurrency mapping, the one primitive the pipeline needs to stop running
 * four independent claims one after another. Results come back in the input's order whatever
 * order the work finished in, which is what keeps a parallel run as reproducible as the serial
 * one it replaces.
 *
 * Why a limit at all, rather than Promise.all: the judging call is an LLM request, and the free
 * tiers this product is built for meter requests per minute (OpenRouter's free models: 20 RPM).
 * Firing every claim at once is the fastest way to turn a working check into a 429 storm.
 * Main exports: mapWithConcurrency.
 */

/**
 * Runs `worker` over `items` with at most `limit` calls in flight, preserving input order in
 * the returned array. A worker that rejects rejects the whole call — every worker passed in
 * here handles its own failures and returns a value instead.
 */
export async function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  limit: number,
  worker: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = new Array<Result>(items.length);
  let nextIndex = 0;
  const runLane = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      if (index >= items.length) return;
      nextIndex += 1;
      results[index] = await worker(items[index] as Item, index);
    }
  };
  const laneCount = Math.max(1, Math.min(Math.floor(limit), items.length));
  await Promise.all(Array.from({ length: laneCount }, () => runLane()));
  return results;
}
