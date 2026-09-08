/**
 * Purpose: a fetch wrapper that times every HTTP request a call makes and reports its status,
 * so the bench can say how long a purpose takes on a model and how many requests it took to
 * get an answer out of it (core-llm retries transport failures and corrects one malformed
 * reply, and both are invisible from the outside otherwise).
 *
 * It deliberately does NOT rewrite the request body. The per-provider fields that turn a
 * model's deliberation off live in core-llm's thinkingOffFields and are applied by the real
 * client, so the bench measures the request the product actually sends rather than one only
 * this file knows how to build.
 *
 * Main exports: createBenchFetch, BenchFetchRecord, BenchFetchProbe.
 */

export interface BenchFetchRecord {
  /** Wall time from request start to response headers, in milliseconds. */
  latencyMs: number;
  /** HTTP status, or 0 when the request never got one (network failure, timeout). */
  status: number;
}

export interface BenchFetchProbe {
  fetchImpl: typeof globalThis.fetch;
  records(): readonly BenchFetchRecord[];
}

export function createBenchFetch(
  options: { baseFetch?: typeof globalThis.fetch; now?: () => number } = {},
): BenchFetchProbe {
  const baseFetch = options.baseFetch ?? globalThis.fetch;
  const now = options.now ?? (() => Date.now());
  const log: BenchFetchRecord[] = [];
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const startedAt = now();
    try {
      const response = await baseFetch(input, init);
      log.push({ latencyMs: now() - startedAt, status: response.status });
      return response;
    } catch (error) {
      // Recorded so a run's latency stats include the calls that died on the wire instead of
      // quietly describing only the healthy ones.
      log.push({ latencyMs: now() - startedAt, status: 0 });
      throw error;
    }
  };
  return { fetchImpl, records: () => log };
}
