/**
 * Purpose: the runtime's wasm comes from this origin, and Safari gets the variant
 * transformers.js would have given it.
 */
import { describe, expect, it } from "vitest";
import { isSafariLike, ORT_FILES, ortWasmPaths, safariSimdIsBroken } from "./embedding/ortAssets";

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

describe("safariSimdIsBroken", () => {
  const safari = (version: string) => ({
    userAgent: `Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Safari/604.1`,
    vendor: "Apple Computer, Inc.",
  });

  it("refuses the one version whose SIMD returns wrong numbers", () => {
    expect(safariSimdIsBroken(safari("16.4"))).toBe(true);
  });

  it("allows the versions either side of it", () => {
    expect(safariSimdIsBroken(safari("16.3"))).toBe(false);
    expect(safariSimdIsBroken(safari("16.5"))).toBe(false);
    expect(safariSimdIsBroken(safari("18.2"))).toBe(false);
  });

  it("allows other browsers and unreadable user agents", () => {
    expect(safariSimdIsBroken({ userAgent: "Mozilla/5.0 Chrome/124", vendor: "Google Inc." })).toBe(
      false,
    );
    expect(safariSimdIsBroken({ userAgent: "Safari", vendor: "Apple Computer, Inc." })).toBe(false);
    expect(safariSimdIsBroken(undefined)).toBe(false);
  });
});
