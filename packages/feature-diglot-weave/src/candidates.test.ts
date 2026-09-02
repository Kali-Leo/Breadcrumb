/**
 * Purpose: tests for candidate extraction — lemmatization via forms, the never-replace
 * guards (collocation interior, capitalized surface, t1Safe:false) and first-occurrence
 * deduplication (spec 033, acceptance 5).
 */
import { describe, expect, it } from "vitest";
import { extractCandidates } from "./candidates";
import { makeEnFrPack, makeZhEnPack } from "./testFixture";
import { tokenizeMessage } from "./tokenize";

function lemmasIn(message: string, sourceLang: "en" | "zh"): string[] {
  const loaded = sourceLang === "en" ? makeEnFrPack() : makeZhEnPack();
  return extractCandidates(tokenizeMessage(message, sourceLang), loaded).map(
    (candidate) => candidate.lemma,
  );
}

describe("extractCandidates", () => {
  it("finds dictionary words and lemmatizes inflected forms", () => {
    expect(lemmasIn("they keep reading old books", "en")).toEqual(["read", "book"]);
  });

  it("keeps only the first occurrence of a lemma", () => {
    expect(lemmasIn("a book, another book", "en")).toEqual(["book"]);
  });

  it("never picks the interior of a longer dictionary collocation", () => {
    expect(lemmasIn("our book club meets", "en")).toEqual([]);
  });

  it("never picks capitalized surfaces (runtime proper-noun guard)", () => {
    expect(lemmasIn("ask Book about it", "en")).toEqual([]);
  });

  it("never picks entries marked t1Safe:false", () => {
    expect(lemmasIn("a rare find", "en")).toEqual([]);
  });

  it("works on ICU-segmented space-free Chinese", () => {
    expect(lemmasIn("我喜欢朋友", "zh")).toEqual(["喜欢", "朋友"]);
    expect(lemmasIn("这些书本很好", "zh")).toContain("书本");
  });
});
