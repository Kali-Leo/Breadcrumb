/**
 * Purpose: unit tests for canonicalJsonStringify — key order independence, nested
 * structures, and undefined-property elision (the signature stability contract).
 */
import { describe, expect, it } from "vitest";
import { canonicalJsonStringify } from "./canonicalJson";

describe("canonicalJsonStringify", () => {
  it("serializes identically regardless of key insertion order", () => {
    const a = { b: 1, a: { d: [1, 2], c: "x" } };
    const b = { a: { c: "x", d: [1, 2] }, b: 1 };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    expect(canonicalJsonStringify(a)).toBe('{"a":{"c":"x","d":[1,2]},"b":1}');
  });

  it("keeps array order and drops undefined properties", () => {
    expect(canonicalJsonStringify({ x: [3, 1, 2], y: undefined as unknown as string })).toBe(
      '{"x":[3,1,2]}',
    );
  });

  it("handles primitives and null", () => {
    expect(canonicalJsonStringify(null)).toBe("null");
    expect(canonicalJsonStringify("s")).toBe('"s"');
    expect(canonicalJsonStringify(3.5)).toBe("3.5");
  });
});
