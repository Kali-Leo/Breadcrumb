/**
 * Purpose: which host the model is downloaded from. The app is used from places where
 * huggingface.co is unreachable, so reachability is measured at run time rather than assumed:
 * each candidate is asked for one small file with a short timeout, in order of preference,
 * and the first that answers is used for the session.
 *
 * A round in which nothing answered is remembered for a minute rather than for the session,
 * so a laptop that was briefly offline is not stuck until the page is reloaded, while the
 * embedding calls the app makes in the background do not each pay two timeouts.
 * Main exports: MODEL_ID, MODEL_SOURCES, isModelSourceUrl, probeSource, createSourceResolver.
 */

export const MODEL_ID = "Xenova/multilingual-e5-small";

/** In order of preference. hf-mirror.com serves the mainland directly and redirects everyone
 * else to huggingface.co, so a probe that follows redirects measures what a download would
 * actually meet. */
export const MODEL_SOURCES: readonly string[] = [
  "https://huggingface.co/",
  "https://hf-mirror.com/",
];

export const PROBE_TIMEOUT_MS = 3_000;
export const RETRY_FAILED_ROUND_AFTER_MS = 60_000;

/** The smallest file of the model: a probe that does not answer within the timeout with it is
 * not going to manage 113 MB. */
export function probeUrl(host: string): string {
  return `${host}${MODEL_ID}/resolve/main/config.json`;
}

export function isModelSourceUrl(url: string, sources: readonly string[] = MODEL_SOURCES): boolean {
  return sources.some((host) => url.startsWith(host));
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** True when the host answered the HEAD probe with a success status inside the timeout.
 * Anything else — a timeout, a network error, a 4xx/5xx — is "not this one". */
export async function probeSource(
  host: string,
  fetchFn: FetchLike,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(probeUrl(host), {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface SourceResolver {
  /** The chosen host with its trailing slash, or null when no candidate answered. */
  resolve(): Promise<string | null>;
}

export interface SourceResolverDeps {
  fetch: FetchLike;
  now?: () => number;
  sources?: readonly string[];
  timeoutMs?: number;
}

export function createSourceResolver(deps: SourceResolverDeps): SourceResolver {
  const now = deps.now ?? (() => Date.now());
  const sources = deps.sources ?? MODEL_SOURCES;
  let chosen: string | null = null;
  let failedRoundAt: number | null = null;
  let inFlight: Promise<string | null> | null = null;

  async function probeAll(): Promise<string | null> {
    for (const host of sources) {
      if (await probeSource(host, deps.fetch, deps.timeoutMs)) return host;
    }
    return null;
  }

  return {
    async resolve() {
      if (chosen !== null) return chosen;
      if (failedRoundAt !== null && now() - failedRoundAt < RETRY_FAILED_ROUND_AFTER_MS) {
        return null;
      }
      inFlight ??= probeAll().then((host) => {
        inFlight = null;
        if (host === null) failedRoundAt = now();
        else chosen = host;
        return host;
      });
      return inFlight;
    },
  };
}
