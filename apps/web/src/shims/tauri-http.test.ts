/**
 * Purpose: one translation happens in this shim and it decides a security question, so it is
 * worth a test. safeFetch asks for `maxRedirections: 0` because it re-checks every hop itself;
 * the browser has no such option, and the nearest honest equivalent is `redirect: "manual"` —
 * an opaque response the caller cannot follow, which safeFetch reads as a refusal. Dropping the
 * option instead would let the browser follow the redirect silently.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetch as shimFetch } from "./tauri-http";

const underlying = vi.fn(async () => new Response("ok"));
const original = globalThis.fetch;

beforeEach(() => {
  underlying.mockClear();
  globalThis.fetch = underlying as unknown as typeof globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = original;
});

describe("the browser's fetch, standing in for the Rust one", () => {
  it("turns a refusal to follow redirects into a manual one", async () => {
    await shimFetch("https://example.com", { method: "POST", maxRedirections: 0 });
    expect(underlying).toHaveBeenCalledWith("https://example.com", {
      method: "POST",
      redirect: "manual",
    });
  });

  it("never passes the Rust-only option through to the browser", async () => {
    await shimFetch("https://example.com", { maxRedirections: 5 });
    expect(underlying).toHaveBeenCalledWith("https://example.com", {});
  });

  it("leaves a plain request exactly as it was", async () => {
    await shimFetch("https://example.com");
    expect(underlying).toHaveBeenCalledWith("https://example.com");
  });
});
