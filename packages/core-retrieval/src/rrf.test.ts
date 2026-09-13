/**
 * Purpose: the fusion arithmetic, and in particular the one property the measurements bought
 * at the price of a week of compute — that the vector route is weighted three times the
 * keyword route, and that this is what stops a weak lexical ranking from dragging a strong
 * dense one down. A regression here is invisible: fused results still look like results.
 */
import { describe, expect, it } from "vitest";
import { KEYWORD_WEIGHT, RERANK_DEPTH, ROUTE_DEPTH, VECTOR_WEIGHT } from "./constants";
import { fuseRrf, RRF_K } from "./rrf";

const routes = (keyword: string[], vector: string[]) => [
  { ids: keyword, weight: KEYWORD_WEIGHT },
  { ids: vector, weight: VECTOR_WEIGHT },
];

describe("constants", () => {
  it("are the ones every measured number was produced with", () => {
    expect(RRF_K).toBe(60);
    expect(VECTOR_WEIGHT / KEYWORD_WEIGHT).toBe(3);
    expect(ROUTE_DEPTH).toBe(100);
    expect(RERANK_DEPTH).toBe(50);
    // Depth has to exceed what is read, or reranking cannot change which passages are read
    // at all — measured: reranking the top 8 leaves R@8 bit-identical.
    expect(RERANK_DEPTH).toBeGreaterThan(8);
  });
});

describe("fuseRrf", () => {
  it("adds 1/(k + rank) across the routes a passage appears in", () => {
    const fused = fuseRrf([{ ids: ["a", "b"], weight: 1 }]);
    expect(fused[0]).toEqual({ id: "a", score: 1 / 61 });
    expect(fused[1]).toEqual({ id: "b", score: 1 / 62 });
  });

  it("puts a passage both routes liked above one either route loved", () => {
    const fused = fuseRrf(routes(["shared", "keyword-only"], ["vector-only", "shared"]));
    expect(fused[0]?.id).toBe("shared");
  });

  it("does not let the keyword route outvote the vector route", () => {
    // The failure the weighting exists to prevent: equal weight measured 0.447 macro nDCG@10
    // against 0.619 for the vector route alone, on every one of ten languages.
    const fused = fuseRrf(routes(["lexical"], ["dense"]));
    expect(fused[0]?.id).toBe("dense");
  });

  it("still ranks a keyword-only passage, because that is what fusion is for", () => {
    const fused = fuseRrf(routes(["missed-by-vectors"], ["x", "y", "z"]));
    expect(fused.map((hit) => hit.id)).toContain("missed-by-vectors");
  });

  it("is the surviving route's own order when the other one is empty", () => {
    // A library mid-import: keyword index built, no vectors yet. This must simply work.
    expect(fuseRrf(routes(["a", "b", "c"], [])).map((hit) => hit.id)).toEqual(["a", "b", "c"]);
    expect(fuseRrf(routes([], ["a", "b"])).map((hit) => hit.id)).toEqual(["a", "b"]);
  });

  it("breaks ties by first appearance rather than by chance", () => {
    const first = fuseRrf([
      { ids: ["a", "b"], weight: 1 },
      { ids: ["b", "a"], weight: 1 },
    ]);
    const again = fuseRrf([
      { ids: ["a", "b"], weight: 1 },
      { ids: ["b", "a"], weight: 1 },
    ]);
    expect(first.map((hit) => hit.id)).toEqual(again.map((hit) => hit.id));
    expect(first[0]?.id).toBe("a");
  });

  it("has nothing to say about nothing", () => {
    expect(fuseRrf([])).toEqual([]);
    expect(fuseRrf(routes([], []))).toEqual([]);
  });
});
