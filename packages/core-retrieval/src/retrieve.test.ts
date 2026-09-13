/**
 * Purpose: the shape of one retrieval — that children are searched and parents returned, that
 * two hits in the same section do not fill the answer with one section, that the reranker is
 * an improvement and never a dependency, and that a library whose vectors have not been
 * computed yet is still searchable. That last one is not an edge case; it is the first minute
 * after every import.
 */
import { describe, expect, it, vi } from "vitest";
import { createRerankPolicy } from "./rerankPolicy";
import { type RetrievalDeps, type RetrievedPassage, retrieve } from "./retrieve";
import { TOPIC_OVERLAP_THRESHOLD } from "./topicDrift";

function parent(id: string): RetrievedPassage {
  return { id, documentId: "doc", headingPath: `书 → ${id}`, body: `body of ${id}` };
}

/** child "cN" belongs to parent "pN"; "c1b" also belongs to "p1". */
function parentOfChild(childId: string): RetrievedPassage {
  return parent(childId === "c1b" ? "p1" : childId.replace("c", "p"));
}

function deps(overrides: Partial<RetrievalDeps> = {}): RetrievalDeps {
  return {
    keywordSearch: async () => ["c1", "c2"],
    vectorSearch: async () => ["c3", "c1"],
    resolveParents: async (ids) => new Map(ids.map((id) => [id, parentOfChild(id)])),
    ...overrides,
  };
}

describe("retrieve", () => {
  it("returns parent blocks, not the children that matched", async () => {
    const found = await retrieve("复利是什么", deps(), { topK: 3 });
    expect(found.map((passage) => passage.id)).toEqual(["p1", "p3", "p2"]);
    expect(found[0]?.body).toBe("body of p1");
  });

  it("keeps the heading path, because it is part of the evidence", async () => {
    const [first] = await retrieve("复利", deps(), { topK: 1 });
    expect(first?.headingPath).toBe("书 → p1");
  });

  it("collapses two hits in one section into one result", async () => {
    const found = await retrieve(
      "q",
      deps({ keywordSearch: async () => ["c1", "c1b", "c2"], vectorSearch: async () => [] }),
      { topK: 5 },
    );
    expect(found.map((passage) => passage.id)).toEqual(["p1", "p2"]);
  });

  it("searches on keywords alone while the vectors are still being computed", async () => {
    const found = await retrieve(
      "q",
      deps({ keywordSearch: async () => ["c9", "c8"], vectorSearch: async () => [] }),
      { topK: 2 },
    );
    expect(found.map((passage) => passage.id)).toEqual(["p9", "p8"]);
  });

  it("asks each route for a pool far deeper than what it returns", async () => {
    const limits: number[] = [];
    const keywordSearch = async (_match: string, limit: number) => {
      limits.push(limit);
      return ["c1"];
    };
    await retrieve("q", deps({ keywordSearch }), { topK: 1 });
    expect(limits).toEqual([100]);
  });

  it("quotes every query term so nothing a reader types is read as syntax", async () => {
    const seen: string[] = [];
    const keywordSearch = async (match: string) => {
      seen.push(match);
      return [];
    };
    await retrieve("AND NOT *", deps({ keywordSearch }));
    expect(seen[0]).toBe('"and" OR "not"');
  });

  it("reorders by the reranker when asked, and only when asked", async () => {
    const rerank = vi.fn(async (_q: string, passages: readonly RetrievedPassage[]) =>
      passages.map((passage) => (passage.id === "p2" ? 9 : 0)),
    );
    expect((await retrieve("q", deps({ rerank }), { topK: 3 })).map((p) => p.id)).toEqual([
      "p1",
      "p3",
      "p2",
    ]);
    expect(rerank).not.toHaveBeenCalled();
    const reranked = await retrieve("q", deps({ rerank }), { topK: 3, rerank: true });
    expect(reranked.map((passage) => passage.id)).toEqual(["p2", "p1", "p3"]);
  });

  it("keeps the fused answer when the reranker fails", async () => {
    const rerank = async () => {
      throw new Error("model not downloaded");
    };
    const found = await retrieve("q", deps({ rerank }), { topK: 2, rerank: true });
    expect(found.map((passage) => passage.id)).toEqual(["p1", "p3"]);
  });

  it("ignores a reranker that returned the wrong number of scores", async () => {
    // A misaligned score list ranks each passage by another passage's relevance and looks
    // exactly like a working reranker, so it must not be trusted at all.
    const rerank = async () => [1];
    const found = await retrieve("q", deps({ rerank }), { topK: 3, rerank: true });
    expect(found.map((passage) => passage.id)).toEqual(["p1", "p3", "p2"]);
  });

  it("returns nothing rather than everything for a topK of zero", async () => {
    expect(await retrieve("q", deps(), { topK: 0 })).toEqual([]);
  });
});

describe("createRerankPolicy", () => {
  it("always reranks the first question of a conversation", () => {
    expect(createRerankPolicy().shouldRerank("复利是什么")).toBe(true);
  });

  it("skips a follow-up about the same thing", () => {
    const policy = createRerankPolicy();
    policy.shouldRerank("复利的计算公式是什么");
    expect(policy.shouldRerank("复利的计算公式有例子吗")).toBe(false);
  });

  it("spends one when the subject changes", () => {
    const policy = createRerankPolicy();
    policy.shouldRerank("复利的计算公式是什么");
    expect(policy.shouldRerank("光合作用需要哪些条件")).toBe(true);
  });

  it("reranks every turn where it is nearly free", () => {
    const policy = createRerankPolicy({ everyTurn: true });
    policy.shouldRerank("复利的计算公式是什么");
    expect(policy.shouldRerank("复利的计算公式有例子吗")).toBe(true);
  });

  it("treats a reset conversation as a new topic", () => {
    const policy = createRerankPolicy();
    policy.shouldRerank("复利");
    policy.reset();
    expect(policy.shouldRerank("复利")).toBe(true);
    expect(TOPIC_OVERLAP_THRESHOLD).toBeLessThan(0.5);
  });
});
