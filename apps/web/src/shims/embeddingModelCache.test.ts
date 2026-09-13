/**
 * Purpose: the cache that makes one download serve every session — keyed so that the CDN and
 * the fallback share an entry, and never able to fail the embedding that is using it.
 */
import { describe, expect, it, vi } from "vitest";
import { canonicalCacheKey, createModelCache } from "./embedding/modelCache";
import { JSDELIVR_BASE, MODEL_SOURCES, RAW_GITHUB_BASE } from "./embedding/modelSource";

const FILE = "onnx/model_int8.onnx";

describe("canonicalCacheKey", () => {
  it("rewrites every known source to the first one", () => {
    expect(canonicalCacheKey(`${RAW_GITHUB_BASE}${FILE}`, MODEL_SOURCES)).toBe(
      `${JSDELIVR_BASE}${FILE}`,
    );
    expect(canonicalCacheKey(`${JSDELIVR_BASE}${FILE}`, MODEL_SOURCES)).toBe(
      `${JSDELIVR_BASE}${FILE}`,
    );
  });

  it("leaves other URLs alone", () => {
    const wasm = "https://example.github.io/Breadcrumb/ort/ort-wasm-simd-threaded.wasm";
    expect(canonicalCacheKey(wasm, MODEL_SOURCES)).toBe(wasm);
    expect(canonicalCacheKey("/models/Xenova/x/config.json", MODEL_SOURCES)).toBe(
      "/models/Xenova/x/config.json",
    );
  });
});

describe("createModelCache", () => {
  it("reads and writes through the canonical key", async () => {
    const entries = new Map<string, Response>();
    const cache = createModelCache(
      async () => ({
        match: async (request: RequestInfo | URL) => entries.get(String(request)),
        put: async (request: RequestInfo | URL, response: Response) => {
          entries.set(String(request), response);
        },
      }),
      MODEL_SOURCES,
    );
    await cache.put(`${RAW_GITHUB_BASE}${FILE}`, new Response("bytes"));
    const hit = await cache.match(`${JSDELIVR_BASE}${FILE}`);
    expect(await hit?.text()).toBe("bytes");
    expect([...entries.keys()]).toEqual([`${JSDELIVR_BASE}${FILE}`]);
  });

  it("turns a broken cache into a miss and a swallowed write", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const cache = createModelCache(async () => {
        throw new DOMException("quota", "QuotaExceededError");
      }, MODEL_SOURCES);
      await expect(cache.match(`${JSDELIVR_BASE}${FILE}`)).resolves.toBeUndefined();
      await expect(cache.put(`${JSDELIVR_BASE}${FILE}`, new Response(""))).resolves.toBe(undefined);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
