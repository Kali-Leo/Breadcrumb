/**
 * Purpose: the shape of one retrieval — that children are searched and parents returned, that
 * two hits in the same section do not fill the answer with one section, that the reranker is
 * an improvement and never a dependency, and that a library whose vectors have not been
 * computed yet is still searchable. That last one is not an edge case; it is the first minute
 * after every import.
 */
import { describe, expect, it, vi } from "vitest";
import { createRerankPolicy } from "./rerankPolicy";
import { type RetrievalDeps, type RetrievedPassage, type RouteHit, retrieve } from "./retrieve";
import { TOPIC_OVERLAP_THRESHOLD } from "./topicDrift";

function parent(id: string): RetrievedPassage {
  return { id, documentId: "doc", headingPath: `书 → ${id}`, body: `body of ${id}` };
}

/** child "cN" belongs to parent "pN"; "c1b" also belongs to "p1". */
function parentOfChild(childId: string): RetrievedPassage {
  return parent(childId === "c1b" ? "p1" : childId.replace("c", "p"));
}

/** Vector hits with a high, then descending, cosine — all clearly about the question. */
function hits(ids: readonly string[], top = 0.9): RouteHit[] {
  return ids.map((id, index) => ({ id, score: top - index * 0.05 }));
}

function deps(overrides: Partial<RetrievalDeps> = {}): RetrievalDeps {
  return {
    keywordSearch: async () => ["c1", "c2"],
    vectorSearch: async () => hits(["c3", "c1"]),
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

  it("reads only as deep as the budget says and keeps the rest in fused order", async () => {
    const seen: string[][] = [];
    const rerank = async (_q: string, passages: readonly RetrievedPassage[]) => {
      seen.push(passages.map((passage) => passage.id));
      return passages.map((passage) => (passage.id === "p3" ? 9 : 0));
    };
    const found = await retrieve("q", deps({ rerank }), { topK: 3, rerank: true, rerankDepth: 2 });
    expect(seen).toEqual([["p1", "p3"]]);
    expect(found.map((passage) => passage.id)).toEqual(["p3", "p1", "p2"]);
  });

  it("carries each passage's evidence: best child cosine, keyword hit, reranker score", async () => {
    const rerank = async (_q: string, passages: readonly RetrievedPassage[]) =>
      passages.map((passage) => (passage.id === "p1" ? 4.5 : -3));
    const [first] = await retrieve(
      "q",
      deps({
        keywordSearch: async () => ["c1b"],
        vectorSearch: async () => hits(["c1", "c3"]),
        rerank,
      }),
      { topK: 1, rerank: true },
    );
    expect(first?.id).toBe("p1");
    expect(first?.relevance).toEqual({
      cosine: 0.9,
      keywordHit: true,
      rerank: 4.5,
      coverage: null,
    });
  });
});

describe("retrieve with onlyRelevant", () => {
  it("returns nothing for a question the library is not about, and spends no reranker", async () => {
    const rerank = vi.fn(async (_q: string, passages: readonly RetrievedPassage[]) =>
      passages.map(() => 5),
    );
    const far = deps({ vectorSearch: async () => hits(["c3", "c1"], 0.4), rerank });
    const found = await retrieve("珠穆朗玛峰有多高", far, { rerank: true, onlyRelevant: true });
    expect(found).toEqual([]);
    expect(rerank).not.toHaveBeenCalled();
  });

  it("lets the reranker's score decide once it has read a passage", async () => {
    const rerank = async (_q: string, passages: readonly RetrievedPassage[]) =>
      passages.map((passage) => (passage.id === "p3" ? 1 : -9));
    const found = await retrieve("q", deps({ rerank }), { rerank: true, onlyRelevant: true });
    expect(found.map((passage) => passage.id)).toEqual(["p3"]);
  });

  it("falls back to the cosine line when there is no reranker", async () => {
    const found = await retrieve(
      "q",
      deps({
        keywordSearch: async () => ["c2", "c1"],
        vectorSearch: async () => [
          { id: "c3", score: 0.8 },
          { id: "c1", score: 0.68 },
          { id: "c2", score: 0.5 },
        ],
      }),
      { onlyRelevant: true },
    );
    // p3 clears the line; p1 does not, and a keyword hit is measured to lift nothing.
    expect(found.map((passage) => passage.id)).toEqual(["p3"]);
  });

  it("measures how much of the question a passage holds while there are no vectors yet", async () => {
    const parents = new Map([
      ["c1", { ...parent("p1"), body: "复利是本金和利息一起再计息的方式" }],
      ["c2", { ...parent("p2"), body: "本条例自公布之日起施行" }],
    ]);
    const found = await retrieve(
      "复利是什么",
      deps({
        keywordSearch: async () => ["c2", "c1"],
        vectorSearch: async () => [],
        resolveParents: async () => parents,
        language: "zh-CN",
      }),
      { onlyRelevant: true },
    );
    expect(found.map((passage) => passage.id)).toEqual(["p1"]);
    expect(found[0]?.relevance.coverage).toBeGreaterThanOrEqual(0.4);
  });

  it("does not lift a passage below the vector top-100 on a keyword hit alone", async () => {
    const found = await retrieve(
      "q",
      deps({
        keywordSearch: async () => ["c9"],
        vectorSearch: async () => [{ id: "c3", score: 0.9 }],
      }),
      { onlyRelevant: true },
    );
    expect(found.map((passage) => passage.id)).toEqual(["p3"]);
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
