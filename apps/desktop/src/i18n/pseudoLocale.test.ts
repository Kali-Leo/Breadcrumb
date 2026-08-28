/**
 * Purpose: the pseudolocale only earns its place if it actually stresses what it claims to —
 * length, accented glyph height, non-Latin font fallback, and segment boundaries — while
 * leaving interpolation alone. A padding rule that silently does nothing (the `.repeat(0)`
 * this file's combining accent used to be) makes the whole locale a false negative.
 */
import { describe, expect, it } from "vitest";
import { buildPseudoCatalogue, isPseudoLocale, PSEUDO_LOCALE_CODE } from "./pseudoLocale";

const COMBINING_ACUTE = "́";
const NON_LATIN = /[Ͱ-ϿЀ-ӿ]/;

describe("pseudolocale", () => {
  it("is its own tag and nothing else's", () => {
    expect(isPseudoLocale(PSEUDO_LOCALE_CODE)).toBe(true);
    expect(isPseudoLocale("en")).toBe(false);
    expect(isPseudoLocale("qps")).toBe(false);
  });

  it("grows every string and marks where it begins and ends", () => {
    const source = "Save this to your palace";
    const built = buildPseudoCatalogue({ line: source }).line as string;
    expect(built.startsWith("⟦")).toBe(true);
    expect(built.endsWith("⟧")).toBe(true);
    expect(built.length).toBeGreaterThan(source.length * 1.3);
  });

  it("really applies the combining accent, so accented line height gets tested", () => {
    const built = buildPseudoCatalogue({ line: "Save" }).line as string;
    expect(built).toContain(COMBINING_ACUTE);
  });

  it("mixes in non-Latin letters, so a font stack without a fallback shows tofu here", () => {
    const built = buildPseudoCatalogue({ line: "Save this now" }).line as string;
    expect(built).toMatch(NON_LATIN);
  });

  it("leaves placeholders exactly as they are", () => {
    const built = buildPseudoCatalogue({ line: "Active on {{count}} days" }).line as string;
    expect(built).toContain("{{count}}");
  });

  it("keeps the shape of the catalogue it was given", () => {
    const built = buildPseudoCatalogue({ door: { open: "Open" } });
    expect(typeof (built.door as Record<string, unknown>).open).toBe("string");
  });
});
