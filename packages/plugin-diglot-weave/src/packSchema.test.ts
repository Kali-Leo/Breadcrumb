/**
 * Purpose: tests for the language-pack contract — validation, reverse index and
 * introduction queue derivation (spec 033).
 */
import { describe, expect, it } from "vitest";
import { loadLanguagePack } from "./packSchema";
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
