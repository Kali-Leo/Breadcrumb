/**
 * Purpose: unit tests for the local keyword extractor — Chinese bigrams chained back into whole
 * words, Latin words with function words dropped, terms spread across several read items
 * outranking one item's pet phrase, and the early-days case where one opened article is all the
 * evidence there is.
 */
import { describe, expect, it } from "vitest";
import { extractSalientKeywords, rankKeywords } from "./discoveryKeywords";

describe("rankKeywords", () => {
  it("chains overlapping Chinese bigrams back into the word they came from", () => {
    const ranked = rankKeywords(["机器学习入门", "机器学习的历史"]);
    expect(ranked[0]?.term).toBe("机器学习");
    expect(ranked.map((keyword) => keyword.term)).not.toContain("器学");
  });

  it("drops Chinese fragments built out of grammar characters", () => {
    const terms = rankKeywords(["这是我们的天文望远镜"]).map((keyword) => keyword.term);
    expect(terms).not.toContain("这是");
    expect(terms).not.toContain("我们");
    expect(terms.some((term) => term.includes("望远"))).toBe(true);
  });

  it("reads Latin words as words and leaves function words out", () => {
    const terms = rankKeywords(["What the compiler does with your code"]).map(
      (keyword) => keyword.term,
    );
    expect(terms).toContain("compiler");
    expect(terms).toContain("code");
    expect(terms).not.toContain("the");
    expect(terms).not.toContain("what");
    expect(terms).not.toContain("does");
  });

  it("ranks a term spread over several items above one item's repeated phrase", () => {
    const ranked = rankKeywords([
      "kubernetes networking",
      "kubernetes storage",
      "kubernetes operators",
      "postgres postgres postgres postgres",
    ]);
    expect(ranked[0]?.term).toBe("kubernetes");
    expect(ranked[0]?.documentCount).toBe(3);
  });
});

describe("extractSalientKeywords", () => {
  it("returns at most the asked-for number of terms", () => {
    const terms = extractSalientKeywords(
      ["kubernetes networking", "kubernetes storage", "postgres indexes", "rust ownership"],
      2,
    );
    expect(terms).toHaveLength(2);
  });

  it("keeps a single item's terms while that item is all there is to go on", () => {
    const terms = extractSalientKeywords(["天文望远镜的原理"], 5);
    expect(terms.length).toBeGreaterThan(0);
  });

  it("puts the term the reader keeps coming back to first, one-off terms after it", () => {
    const terms = extractSalientKeywords(
      ["rust ownership", "rust lifetimes", "postgres indexes", "kubernetes networking"],
      5,
    );
    expect(terms[0]).toBe("rust");
    // The one-off terms still qualify as queries; they just queue behind the repeated one.
    expect(terms.slice(1)).not.toContain("rust");
    expect(terms).toHaveLength(5);
  });

  it("returns nothing for no documents and for a zero limit", () => {
    expect(extractSalientKeywords([], 5)).toEqual([]);
    expect(extractSalientKeywords(["rust ownership"], 0)).toEqual([]);
  });
});
