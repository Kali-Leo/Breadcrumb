/**
 * Purpose: the reachability probe that picks where the model downloads from — order of
 * preference, the timeout, what counts as an answer, and what is remembered.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createSourceResolver,
  type FetchLike,
  isModelSourceUrl,
  MODEL_SOURCES,
  probeSource,
  probeUrl,
  RETRY_FAILED_ROUND_AFTER_MS,
} from "./embedding/modelSource";

const ok = (): Response => new Response(null, { status: 200 });
const notFound = (): Response => new Response(null, { status: 404 });
const never: FetchLike = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  });

describe("probeSource", () => {
  it("asks for the model's smallest file with HEAD and no HTTP cache", async () => {
    const fetchFn = vi.fn<FetchLike>(async () => ok());
    await expect(probeSource("https://huggingface.co/", fetchFn)).resolves.toBe(true);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://huggingface.co/Xenova/multilingual-e5-small/resolve/main/config.json",
    );
    expect(url).toBe(probeUrl("https://huggingface.co/"));
    expect(init?.method).toBe("HEAD");
    expect(init?.cache).toBe("no-store");
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const probe = probeSource("https://huggingface.co/", never, 3_000);
      await vi.advanceTimersByTimeAsync(3_001);
      await expect(probe).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats an error status and a network error alike: not this one", async () => {
    await expect(probeSource("https://a/", async () => notFound())).resolves.toBe(false);
    await expect(
      probeSource("https://a/", async () => {
        throw new TypeError("Failed to fetch");
      }),
    ).resolves.toBe(false);
  });
});

describe("createSourceResolver", () => {
  it("prefers huggingface.co, then the mirror, in that order", async () => {
    expect(MODEL_SOURCES).toEqual(["https://huggingface.co/", "https://hf-mirror.com/"]);
    const fetchFn = vi.fn<FetchLike>(async (url) =>
      url.startsWith("https://huggingface.co/") ? notFound() : ok(),
    );
    const resolver = createSourceResolver({ fetch: fetchFn });
    await expect(resolver.resolve()).resolves.toBe("https://hf-mirror.com/");
    expect(fetchFn.mock.calls.map(([url]) => new URL(url).host)).toEqual([
      "huggingface.co",
      "hf-mirror.com",
    ]);
  });

  it("does not probe the mirror when the origin answers", async () => {
    const fetchFn = vi.fn<FetchLike>(async () => ok());
    const resolver = createSourceResolver({ fetch: fetchFn });
    await expect(resolver.resolve()).resolves.toBe("https://huggingface.co/");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("remembers the chosen host for the session and shares one probe between callers", async () => {
    const fetchFn = vi.fn<FetchLike>(async () => ok());
    const resolver = createSourceResolver({ fetch: fetchFn });
    const [first, second] = await Promise.all([resolver.resolve(), resolver.resolve()]);
    await resolver.resolve();
    expect(first).toBe("https://huggingface.co/");
    expect(second).toBe(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("remembers a round in which nothing answered for a minute, then tries again", async () => {
    let now = 1_000;
    let reachable = false;
    const fetchFn = vi.fn<FetchLike>(async () => (reachable ? ok() : notFound()));
    const resolver = createSourceResolver({ fetch: fetchFn, now: () => now });
    await expect(resolver.resolve()).resolves.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(2);

    reachable = true;
    now += RETRY_FAILED_ROUND_AFTER_MS - 1;
    await expect(resolver.resolve()).resolves.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(2);

    now += 1;
    await expect(resolver.resolve()).resolves.toBe("https://huggingface.co/");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});

describe("isModelSourceUrl", () => {
  it("recognises both hosts and nothing else", () => {
    expect(isModelSourceUrl("https://huggingface.co/Xenova/x/resolve/main/config.json")).toBe(true);
    expect(isModelSourceUrl("https://hf-mirror.com/Xenova/x/resolve/main/config.json")).toBe(true);
    expect(isModelSourceUrl("https://example.github.io/Breadcrumb/ort/ort.wasm")).toBe(false);
    expect(isModelSourceUrl("/models/Xenova/x/config.json")).toBe(false);
  });
});
