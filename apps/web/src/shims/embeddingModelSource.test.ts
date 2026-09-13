/**
 * Purpose: the reachability probe that picks where the model downloads from — order of
 * preference, the timeout, what counts as an answer, and what is remembered.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createSourceResolver,
  type FetchLike,
  isModelSourceUrl,
  JSDELIVR_BASE,
  MODEL_SOURCES,
  probeSource,
  probeUrl,
  RAW_GITHUB_BASE,
  RETRY_FAILED_ROUND_AFTER_MS,
  remotePaths,
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
    await expect(probeSource(JSDELIVR_BASE, fetchFn)).resolves.toBe(true);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://cdn.jsdelivr.net/gh/Kali-Leo/breadcrumb-language-packs@gte-multilingual-base-int8-v1/models/gte-multilingual-base/config.json",
    );
    expect(url).toBe(probeUrl(JSDELIVR_BASE));
    expect(init?.method).toBe("HEAD");
    expect(init?.cache).toBe("no-store");
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const probe = probeSource(JSDELIVR_BASE, never, 3_000);
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
  it("prefers jsDelivr, then the raw GitHub host, in that order", async () => {
    expect(MODEL_SOURCES).toEqual([JSDELIVR_BASE, RAW_GITHUB_BASE]);
    const fetchFn = vi.fn<FetchLike>(async (url) =>
      url.startsWith(JSDELIVR_BASE) ? notFound() : ok(),
    );
    const resolver = createSourceResolver({ fetch: fetchFn });
    await expect(resolver.resolve()).resolves.toBe(RAW_GITHUB_BASE);
    expect(fetchFn.mock.calls.map(([url]) => new URL(url).host)).toEqual([
      "cdn.jsdelivr.net",
      "raw.githubusercontent.com",
    ]);
  });

  it("pins both hosts to the tag the files were published under", () => {
    for (const base of MODEL_SOURCES) expect(base).toContain("gte-multilingual-base-int8-v1");
  });

  it("does not probe the fallback when the CDN answers", async () => {
    const fetchFn = vi.fn<FetchLike>(async () => ok());
    const resolver = createSourceResolver({ fetch: fetchFn });
    await expect(resolver.resolve()).resolves.toBe(JSDELIVR_BASE);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("remembers the chosen host for the session and shares one probe between callers", async () => {
    const fetchFn = vi.fn<FetchLike>(async () => ok());
    const resolver = createSourceResolver({ fetch: fetchFn });
    const [first, second] = await Promise.all([resolver.resolve(), resolver.resolve()]);
    await resolver.resolve();
    expect(first).toBe(JSDELIVR_BASE);
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
    await expect(resolver.resolve()).resolves.toBe(JSDELIVR_BASE);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});

describe("isModelSourceUrl", () => {
  it("recognises both hosts and nothing else", () => {
    expect(isModelSourceUrl(`${JSDELIVR_BASE}onnx/model_int8.onnx`)).toBe(true);
    expect(isModelSourceUrl(`${RAW_GITHUB_BASE}config.json`)).toBe(true);
    // The same repository at a different tag is a different set of bytes, not this one.
    expect(
      isModelSourceUrl("https://cdn.jsdelivr.net/gh/Kali-Leo/breadcrumb-language-packs@v0/x"),
    ).toBe(false);
    expect(isModelSourceUrl("https://example.github.io/Breadcrumb/ort/ort.wasm")).toBe(false);
    expect(isModelSourceUrl("/models/Xenova/x/config.json")).toBe(false);
  });
});

/**
 * The split transformers.js's own path joining forces on us. Getting it wrong does not throw —
 * it produces a URL with a doubled or missing slash, which 404s three layers down inside the
 * library, so it is pinned here rather than discovered in a browser.
 */
describe("remotePaths", () => {
  it("hands the library the origin and the path separately", () => {
    expect(remotePaths(JSDELIVR_BASE)).toEqual({
      host: "https://cdn.jsdelivr.net/",
      template:
        "gh/Kali-Leo/breadcrumb-language-packs@gte-multilingual-base-int8-v1/models/gte-multilingual-base/",
    });
  });

  it("gives a bare origin a template that survives being joined", () => {
    expect(remotePaths("http://127.0.0.1:8788/")).toEqual({
      host: "http://127.0.0.1:8788/",
      template: "./",
    });
  });
});
