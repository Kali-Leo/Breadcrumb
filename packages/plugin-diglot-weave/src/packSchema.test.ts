/**
 * Purpose: tests for the language-pack contract — validation, reverse index and
 * introduction queue derivation (spec 033).
 */
import { describe, expect, it } from "vitest";
import { loadLanguagePack, resolveLemma } from "./packSchema";
import { makeEnFrPack } from "./testFixture";

describe("loadLanguagePack", () => {
  it("builds the reverse target index including altTargets", () => {
    const loaded = makeEnFrPack();
    expect(loaded.lemmasByTarget.get("livre")?.sort()).toEqual(["book", "tome"]);
    expect(loaded.lemmasByTarget.get("bouquin")).toEqual(["book"]);
  });

  it("orders the introduction queue by frequency rank, t1Safe only", () => {
    const loaded = makeEnFrPack();
    expect(loaded.introductionQueue).toEqual(["book", "read", "tome"]);
  });

  it("keeps Object.prototype out of the lookup tables", () => {
    const loaded = makeEnFrPack();
    // Ordinary English words that also name Object.prototype members: on a plain object these
    // resolve to functions and resolveLemma's `string | null` would be a lie.
    for (const word of ["toString", "constructor", "valueOf", "hasOwnProperty"]) {
      expect(resolveLemma(word, loaded)).toBeNull();
    }
    expect(resolveLemma("books", loaded)).toBe("book");
  });

  it("rejects a pack with a malformed pair id", () => {
    expect(() =>
      loadLanguagePack({
        schemaVersion: 1,
        id: "not a pair",
        sourceLang: "en",
        targetLang: "fr",
        version: "test",
        attribution: ["x"],
        capabilities: { t1Safe: true, rtl: false, ruby: false },
        forms: {},
        entries: {},
      }),
    ).toThrow();
  });
});
