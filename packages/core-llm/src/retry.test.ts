/**
 * Purpose: unit tests for the transport retry/timeout layer — which failures earn a retry,
 * which never do, Retry-After compliance, deadline behavior, and abort precedence. Fake
 * timers stand in for the backoff waits so the suite stays instant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchWithRetry,
  LlmTimeoutError,
  MAX_TRANSPORT_RETRIES,
  NON_STREAMING_TIMEOUT_MS,
  RETRY_AFTER_MAX_MS,
  RETRY_AFTER_MIN_MS,
  retryAfterDelayMs,
} from "./retry";

const URL = "https://api.example.com/v1/chat/completions";
const INIT = { method: "POST", body: "{}" };
const OPTIONS = { timeoutMs: NON_STREAMING_TIMEOUT_MS };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Runs every pending backoff wait (never the request deadlines, which are far longer). The
 * caller must have attached its expectation to the promise first — advancing the clock with
 * a rejection still unobserved is what vitest reports as an unhandled rejection. */
async function runBackoffs(): Promise<void> {
  await vi.advanceTimersByTimeAsync(NON_STREAMING_TIMEOUT_MS - 1);
}

describe("fetchWithRetry", () => {
  it("returns the first successful response without retrying", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok", { status: 200 }));
    const pending = fetchWithRetry(fetchImpl, URL, INIT, OPTIONS);
    await runBackoffs();
    const result = await pending;

    expect(result.response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    result.release();
  });

  it("retries a 503 and succeeds on the second attempt", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const pending = fetchWithRetry(fetchImpl, URL, INIT, OPTIONS);
    await runBackoffs();
    const result = await pending;

    expect(result.response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    result.release();
  });

  it("gives up after MAX_TRANSPORT_RETRIES extra attempts on a persistent 429", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("slow down", { status: 429 }));

    const assertion = expect(fetchWithRetry(fetchImpl, URL, INIT, OPTIONS)).rejects.toThrow(
      "HTTP 429",
    );
    await runBackoffs();
    await assertion;
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_TRANSPORT_RETRIES + 1);
  });

  it("never retries a status that would fail identically twice (401)", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("bad key", { status: 401 }));

    const assertion = expect(fetchWithRetry(fetchImpl, URL, INIT, OPTIONS)).rejects.toThrow(
      "HTTP 401",
    );
    await runBackoffs();
    await assertion;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("waits the Retry-After the provider asked for instead of its own backoff", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("slow down", { status: 429, headers: { "Retry-After": "5" } }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const pending = fetchWithRetry(fetchImpl, URL, INIT, OPTIONS);
    // Our own backoff for attempt 0 tops out well under a second, so still being on one call
    // after 2s proves the header, not the default schedule, is driving the wait.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_000);
    const result = await pending;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    result.release();
  });

  it("retries a network-level throw and reports the last one when they all fail", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("connection reset"));

    const assertion = expect(fetchWithRetry(fetchImpl, URL, INIT, OPTIONS)).rejects.toThrow(
      "connection reset",
    );
    await runBackoffs();
    await assertion;
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_TRANSPORT_RETRIES + 1);
  });

  it("times out an attempt that never answers, and surfaces it as LlmTimeoutError", async () => {
    // Never resolves on its own; only the deadline's abort ends it.
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted by signal")));
        }),
    );

    const pending = fetchWithRetry(fetchImpl, URL, INIT, { timeoutMs: 1_000 });
    const assertion = expect(pending).rejects.toBeInstanceOf(LlmTimeoutError);
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_TRANSPORT_RETRIES + 1);
  });

  it("never retries a caller abort — a stop is a stop", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("resource id 7 invalid")));
        }),
    );

    const pending = fetchWithRetry(fetchImpl, URL, INIT, {
      signal: controller.signal,
      timeoutMs: NON_STREAMING_TIMEOUT_MS,
    });
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await assertion;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops a backoff wait the moment the caller aborts", async () => {
    const controller = new AbortController();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("busy", { status: 503 }));

    const pending = fetchWithRetry(fetchImpl, URL, INIT, {
      signal: controller.signal,
      timeoutMs: NON_STREAMING_TIMEOUT_MS,
    });
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await assertion;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("retryAfterDelayMs", () => {
  it("clamps a negative Retry-After instead of retrying with no wait at all", () => {
    // Regression: Number("-5") failed the old `seconds >= 0` guard and fell through to
    // Date.parse("-5"), which V8 resolves to a moment in the past — so the delay came out 0
    // and one rate limit turned into three requests fired back to back.
    expect(retryAfterDelayMs("-5")).toBe(RETRY_AFTER_MIN_MS);
    expect(retryAfterDelayMs("-0.5")).toBe(RETRY_AFTER_MIN_MS);
  });

  it("clamps a Retry-After that points into the past", () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(retryAfterDelayMs(past)).toBe(RETRY_AFTER_MIN_MS);
  });

  it("clamps an absurdly long Retry-After down to the ceiling", () => {
    expect(retryAfterDelayMs("99999")).toBe(RETRY_AFTER_MAX_MS);
  });

  it("still obeys an ordinary seconds count and an HTTP date", () => {
    expect(retryAfterDelayMs("5")).toBe(5_000);
    expect(retryAfterDelayMs(" 3 ")).toBe(3_000);
    const soon = new Date(Date.now() + 4_000).toUTCString();
    expect(retryAfterDelayMs(soon)).toBeGreaterThan(RETRY_AFTER_MIN_MS);
  });

  it("falls back to our own backoff for an absent or unparseable header", () => {
    expect(retryAfterDelayMs(null)).toBeNull();
    expect(retryAfterDelayMs("")).toBeNull();
    expect(retryAfterDelayMs("abc")).toBeNull();
  });
});
