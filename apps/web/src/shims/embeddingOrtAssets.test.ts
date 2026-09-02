/**
 * Purpose: the runtime's wasm comes from this origin, and Safari gets the variant
 * transformers.js would have given it.
 */
import { describe, expect, it } from "vitest";
import { isSafariLike, ORT_FILES, ortWasmPaths } from "./embedding/ortAssets";

const BASE = "https://example.github.io/Breadcrumb/ort/";
const SAFARI = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  vendor: "Apple Computer, Inc.",
};
const CHROME = {
  userAgent:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  vendor: "Google Inc.",
};
const FIREFOX = {
  userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:154.0) Gecko/20100101 Firefox/154.0",
};

describe("isSafariLike", () => {
  it("is Safari only for Apple's own browser", () => {
    expect(isSafariLike(SAFARI)).toBe(true);
    expect(isSafariLike(CHROME)).toBe(false);
    expect(isSafariLike(FIREFOX)).toBe(false);
    expect(isSafariLike({ ...SAFARI, userAgent: `${SAFARI.userAgent} CriOS/126` })).toBe(false);
    expect(isSafariLike(undefined)).toBe(false);
  });
});

describe("ortWasmPaths", () => {
  it("points at the published directory, asyncify for everyone but Safari", () => {
    expect(ortWasmPaths(BASE, CHROME)).toEqual({
      mjs: `${BASE}ort-wasm-simd-threaded.asyncify.mjs`,
      wasm: `${BASE}ort-wasm-simd-threaded.asyncify.wasm`,
    });
    expect(ortWasmPaths(BASE, SAFARI)).toEqual({
      mjs: `${BASE}ort-wasm-simd-threaded.mjs`,
      wasm: `${BASE}ort-wasm-simd-threaded.wasm`,
    });
  });

  it("only ever names files the copy script publishes", () => {
    for (const nav of [CHROME, SAFARI, FIREFOX, undefined]) {
      const paths = ortWasmPaths(BASE, nav);
      for (const url of [paths.mjs, paths.wasm]) {
        expect(url.startsWith(BASE)).toBe(true);
        expect(ORT_FILES).toContain(url.slice(BASE.length));
      }
    }
  });
});
