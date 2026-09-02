/**
 * Purpose: pins the exact FNV-1a numbers the six private copies produced before 2026-09-02.
 * These values are load-bearing: map terrain, evidence ordering, companion pseudonyms, stored
 * context ids and the concept-embedding cache key all derive from them, so a change here
 * silently redraws maps and invalidates caches.
 */
import { describe, expect, it } from "vitest";
import { fnv1a32, fnv1aHex8, seedFromStrings } from "./hash";

describe("fnv1a32", () => {
  it("returns the canonical FNV-1a 32-bit values", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });

  it("is unsigned and stable", () => {
    expect(fnv1a32("知识点")).toBeGreaterThanOrEqual(0);
    expect(fnv1a32("知识点")).toBe(fnv1a32("知识点"));
    expect(fnv1a32("知识点")).not.toBe(fnv1a32("知识树"));
  });
});

describe("fnv1aHex8", () => {
  it("is the same hash, zero-padded to eight hex digits", () => {
    expect(fnv1aHex8("")).toBe("811c9dc5");
    expect(fnv1aHex8("foobar")).toBe("bf9cf968");
    expect(fnv1aHex8("你好朋友")).toHaveLength(8);
    expect(fnv1aHex8("你好朋友")).not.toBe(fnv1aHex8("你好世界"));
  });
});

describe("seedFromStrings", () => {
  it("hashes the parts as one concatenated stream", () => {
    expect(seedFromStrings(["a", "1"])).toBe(fnv1a32("a1"));
  });

  it("separates distinct tuples and repeats identical ones", () => {
    expect(seedFromStrings(["a", "1"])).toBe(seedFromStrings(["a", "1"]));
    expect(seedFromStrings(["a", "1"])).not.toBe(seedFromStrings(["a", "2"]));
    expect(seedFromStrings(["a", "1"])).not.toBe(seedFromStrings(["b", "1"]));
  });
});
