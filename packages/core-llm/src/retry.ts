/**
 * Purpose: the transport-resilience layer both chat calls share — a bounded retry with
 * exponential backoff and jitter for the failures that are worth retrying (429, transient
 * 5xx, network blips), Retry-After compliance, and a per-attempt deadline. Kept out of
 * client.ts so that file stays about SSE and nothing else.
 * Main exports: fetchWithRetry, LlmTimeoutError, llmAbortError, and the tuning constants.
 */

/** How many EXTRA attempts a retryable failure earns, so three requests at most. Same value
 * as the OpenAI SDK's default `max_retries`: enough to ride out one rate-limit window or a
 * single bad gateway, not enough to turn a real outage into a minutes-long hang. */
export const MAX_TRANSPORT_RETRIES = 2;

/** The statuses where "try again" is the documented remedy: 429 rate limit, 500/502/503
 * transient server and gateway faults, 529 provider overload. Everything else (401 bad key,
 * 400 malformed request, 404 unknown model) is our own fault and fails identically twice. */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503, 529]);

/** Backoff base: attempt n waits about BASE * 2^n. */
export const RETRY_BASE_DELAY_MS = 500;
/** Ceiling on our own computed backoff, so the third attempt still happens promptly. */
export const RETRY_MAX_DELAY_MS = 8_000;
/** A provider may ask (via Retry-After) for a longer wait than our backoff. We obey it, but
 * never sleep longer than this — past a minute the app just looks frozen. */
export const RETRY_AFTER_MAX_MS = 60_000;

/** Whole-request budget for a non-streaming call: connect, generate, and read the body.
 * Generous on purpose — a structured-output verdict arriving late over a poor link is still
 * worth having, and this only exists so a half-dead connection cannot hang forever. */
export const NON_STREAMING_TIMEOUT_MS = 120_000;

/** Streaming gets a FIRST-BYTE budget rather than a total one. A healthy long answer can
 * legitimately stream for many minutes, so only the silence *before* the first chunk counts
 * as a hang; once a chunk lands the deadline is cleared and never re-armed. */
export const STREAM_FIRST_BYTE_TIMEOUT_MS = 60_000;

/** Raised when an attempt's own deadline fired. Distinct from an abort so the caller can
 * tell "the network went quiet" apart from "the user pressed stop". */
export class LlmTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`LLM request timed out after ${timeoutMs}ms`);
    this.name = "LlmTimeoutError";
  }
}

/** The one abort shape the app recognizes (see chatStreamControl.isAbortError). */
export function llmAbortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

interface Attempt {
  readonly signal: AbortSignal;
  /** Stops the deadline while KEEPING the caller's abort wired up — streaming calls this on
   * its first chunk so a long reply is never cut short by a stopwatch started before it. */
  clearDeadline(): void;
  /** Clears the deadline and detaches the forwarding listener. Call once the attempt is done. */
  release(): void;
  /** True when this attempt was aborted by its own deadline rather than by the caller. */
  timedOut(): boolean;
}

function startAttempt(userSignal: AbortSignal | undefined, timeoutMs: number): Attempt {
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = (): void => controller.abort();
  userSignal?.addEventListener("abort", forwardAbort);
  return {
    signal: controller.signal,
    clearDeadline: () => clearTimeout(timer),
    release: () => {
      clearTimeout(timer);
      userSignal?.removeEventListener("abort", forwardAbort);
    },
    timedOut: () => expired,
  };
}

/** Read through a call so TypeScript never narrows `aborted` across an await — it can flip
 * at any moment, which is the entire point of the flag. */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/** Resolves after `ms`, or rejects immediately if the caller aborts while we wait — a stop
 * pressed during a backoff must take effect now, not after the sleep. */
function sleep(ms: number, userSignal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isAborted(userSignal)) {
      reject(llmAbortError("LLM retry wait aborted by its caller"));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(llmAbortError("LLM retry wait aborted by its caller"));
    };
    const timer = setTimeout(() => {
      userSignal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    userSignal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Retry-After is either a seconds count or an HTTP date; both are in the spec and both are
 * seen in the wild. Returns null when the header is absent or unparseable. */
function parseRetryAfterMs(header: string | null): number | null {
  if (header === null) return null;
  const seconds = Number(header.trim());
  if (header.trim() !== "" && Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/** "Equal jitter" (half fixed, half random) over the capped exponential delay, so clients
 * rate-limited at the same instant do not all come back in lockstep. */
function backoffDelayMs(attemptIndex: number, retryAfter: string | null): number {
  const requested = parseRetryAfterMs(retryAfter);
  if (requested !== null) return Math.min(requested, RETRY_AFTER_MAX_MS);
  const capped = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** attemptIndex);
  return capped / 2 + Math.random() * (capped / 2);
}

export interface RetryingFetchResult {
  response: Response;
  /** See Attempt.clearDeadline — the first-byte hook for streaming callers. */
  clearDeadline(): void;
  /** See Attempt.release — call it in a `finally` once the body has been consumed. */
  release(): void;
  /** True when the deadline, not the caller, aborted this request. */
  timedOut(): boolean;
}

/**
 * One `fetch` with retries. Retries only what is worth retrying; a caller-initiated abort is
 * never retried and always surfaces as an AbortError. Non-2xx responses that are not
 * retryable (or have exhausted their retries) throw `LLM request failed: HTTP <status>`.
 */
export async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: Omit<RequestInit, "signal">,
  options: { signal?: AbortSignal; timeoutMs: number },
): Promise<RetryingFetchResult> {
  const userSignal = options.signal;
  for (let attemptIndex = 0; ; attemptIndex++) {
    if (isAborted(userSignal)) throw llmAbortError("LLM request aborted by its caller");
    const attempt = startAttempt(userSignal, options.timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, signal: attempt.signal });
    } catch (error) {
      attempt.release();
      if (isAborted(userSignal)) throw llmAbortError("LLM request aborted by its caller");
      const failure = attempt.timedOut() ? new LlmTimeoutError(options.timeoutMs) : error;
      if (attemptIndex >= MAX_TRANSPORT_RETRIES) throw failure;
      await sleep(backoffDelayMs(attemptIndex, null), userSignal);
      continue;
    }
    if (response.ok) {
      return {
        response,
        clearDeadline: attempt.clearDeadline,
        release: attempt.release,
        timedOut: attempt.timedOut,
      };
    }
    attempt.release();
    const worthRetrying =
      RETRYABLE_STATUSES.has(response.status) && attemptIndex < MAX_TRANSPORT_RETRIES;
    if (!worthRetrying) throw new Error(`LLM request failed: HTTP ${response.status}`);
    await sleep(backoffDelayMs(attemptIndex, response.headers.get("Retry-After")), userSignal);
  }
}
