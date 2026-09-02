/**
 * Purpose: unit tests for cosine-similarity candidate ranking (relative-gate + absolute-cap)
 * and the same-parent/most-recent fallback candidate strategy.
 */
import type { KnowledgeNodeRow, NodeEmbeddingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { fallbackCandidatePairs, MAX_FALLBACK_SIBLINGS, rankCandidatePairs } from "./similarity";

function embedding(nodeId: string, vector: number[]): NodeEmbeddingRow {
  return {
    node_id: nodeId,
    model: "multilingual-e5-small",
    vector_json: JSON.stringify(vector),
    created_at: "2026-08-01T10:00:00Z",
  };
}

/** Unit vector at `angleDegrees` from the x-axis, in 2D. */
function unitVectorAtAngle(angleDegrees: number): number[] {
  const radians = (angleDegrees * Math.PI) / 180;
  return [Math.cos(radians), Math.sin(radians)];
}

/** `count` vectors that are ALL exactly `sharedSimilarity` cosine-similar to [1, 0, 0, ...]
 * — built by giving each candidate its own orthogonal axis, so the relative gate can never
 * distinguish between them and only the absolute cap can bound the result. */
function equallySimilarEmbeddings(count: number, sharedSimilarity: number): NodeEmbeddingRow[] {
  const orthogonalMagnitude = Math.sqrt(1 - sharedSimilarity * sharedSimilarity);
  const rows: NodeEmbeddingRow[] = [];
  for (let index = 0; index < count; index += 1) {
    const vector = new Array(count + 1).fill(0);
    vector[0] = sharedSimilarity;
    vector[index + 1] = orthogonalMagnitude;
    rows.push(embedding(`candidate${index}`, vector));
  }
  return rows;
}

function node(id: string, parentId: string | null, createdAt: string): KnowledgeNodeRow {
  return {
    id,
    parent_id: parentId,
    label: id,
    summary: "",
    kind: "concept",
    created_at: createdAt,
  };
}

describe("rankCandidatePairs", () => {
  it("drops only the unreadable embedding rows, never the whole ranking", () => {
    const embeddings = [
      embedding("new1", [1, 0]),
      { ...embedding("broken", [0, 0]), vector_json: "{not json" },
      { ...embedding("nan", [0, 0]), vector_json: "[0.9, null]" },
      { ...embedding("wrongDims", [0, 0]), vector_json: "[0.9, 0.1, 0.1]" },
      embedding("close", [0.9, 0.1]),
      embedding("far", [0, 1]),
    ];
    const pairs = rankCandidatePairs(embeddings, ["new1"], 8);
    expect(pairs.map((pair) => pair.existingNodeId)).toEqual(["close"]);
  });

  it("ranks the closest existing vector first by cosine similarity", () => {
    const embeddings = [
      embedding("new1", [1, 0]),
      embedding("close", [0.9, 0.1]),
      embedding("far", [0, 1]),
    ];
    const pairs = rankCandidatePairs(embeddings, ["new1"], 8);
    expect(pairs.map((pair) => pair.existingNodeId)).toEqual(["close"]);
    expect(pairs[0]?.similarity ?? 0).toBeGreaterThan(0);
  });

  it("drops a candidate far below the node's own best match even under the absolute cap", () => {
    // near ~cos(10°), mid ~cos(50°), far ~cos(85°): near clears the relative gate against
    // this node's own mean/best, mid and far do not — even though the absolute cap (8) has
    // plenty of room left for all three.
    const embeddings = [
      embedding("new1", unitVectorAtAngle(0)),
      embedding("near", unitVectorAtAngle(10)),
      embedding("mid", unitVectorAtAngle(50)),
      embedding("far", unitVectorAtAngle(85)),
    ];
    const pairs = rankCandidatePairs(embeddings, ["new1"], 8);
    expect(pairs.map((pair) => pair.existingNodeId)).toEqual(["near"]);
  });

  it("still bounds results at the absolute cap when many candidates equally clear the gate", () => {
    const equallySimilar = equallySimilarEmbeddings(10, 0.9);
    const embeddings = [embedding("new1", [1, ...new Array(10).fill(0)]), ...equallySimilar];
    const pairs = rankCandidatePairs(embeddings, ["new1"], 8);
    expect(pairs).toHaveLength(8);
  });

  it("returns [] when the new node has no embedding", () => {
    const embeddings = [embedding("existing", [1, 0])];
    expect(rankCandidatePairs(embeddings, ["missing"], 3)).toEqual([]);
  });

  it("never pairs a new node with another new node", () => {
    const embeddings = [embedding("new1", [1, 0]), embedding("new2", [1, 0])];
    expect(rankCandidatePairs(embeddings, ["new1", "new2"], 3)).toEqual([]);
  });
});

describe("fallbackCandidatePairs", () => {
  it("pairs a new node with its tree siblings", () => {
    const nodes = [
      node("parent", null, "2026-07-01T00:00:00Z"),
      node("sibling", "parent", "2026-07-02T00:00:00Z"),
      node("new1", "parent", "2026-08-01T00:00:00Z"),
    ];
    const pairs = fallbackCandidatePairs(nodes, ["new1"], 0);
    expect(pairs.map((pair) => pair.existingNodeId)).toEqual(["sibling"]);
  });

  it("includes the N most recently created existing nodes regardless of parent", () => {
    const nodes = [
      node("old1", null, "2026-01-01T00:00:00Z"),
      node("old2", null, "2026-02-01T00:00:00Z"),
      node("recent", null, "2026-07-30T00:00:00Z"),
      node("new1", null, "2026-08-01T00:00:00Z"),
    ];
    const pairs = fallbackCandidatePairs(nodes, ["new1"], 1);
    expect(pairs.map((pair) => pair.existingNodeId)).toEqual(["recent"]);
  });

  it("deduplicates a node that is both a sibling and the most recent", () => {
    const nodes = [
      node("parent", null, "2026-01-01T00:00:00Z"),
      node("sibling", "parent", "2026-07-30T00:00:00Z"),
      node("new1", "parent", "2026-08-01T00:00:00Z"),
    ];
    // recentN 1 -> the single most-recent existing node is "sibling", the same node the
    // same-parent rule already selected; the union must not double-count it.
    const pairs = fallbackCandidatePairs(nodes, ["new1"], 1);
    expect(pairs).toHaveLength(1);
  });

  it("returns [] for a root new node with no existing siblings and recentN 0", () => {
    const nodes = [node("new1", null, "2026-08-01T00:00:00Z")];
    expect(fallbackCandidatePairs(nodes, ["new1"], 0)).toEqual([]);
  });

  it("caps siblings at MAX_FALLBACK_SIBLINGS, newest first", () => {
    // A parent with 40 children used to produce 40 pairs for ONE new node, while the edge
    // judge's schema accepts at most 20 verdicts per call (design audit 2026-08-28 #4).
    const nodes = [
      node("parent", null, "2026-01-01T00:00:00Z"),
      ...Array.from({ length: 40 }, (_unused, index) =>
        node(
          `sibling-${index}`,
          "parent",
          `2026-02-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
        ),
      ),
      node("new1", "parent", "2026-08-01T00:00:00Z"),
    ];
    const pairs = fallbackCandidatePairs(nodes, ["new1"], 0);
    expect(pairs).toHaveLength(MAX_FALLBACK_SIBLINGS);
    // Newest siblings win, matching the recent-N pool's own bias.
    expect(pairs[0]?.existingNodeId).toBe("sibling-39");
  });

  it("stays bounded for a whole batch of new nodes under the same crowded parent", () => {
    const nodes = [
      node("parent", null, "2026-01-01T00:00:00Z"),
      ...Array.from({ length: 40 }, (_unused, index) =>
        node(
          `sibling-${index}`,
          "parent",
          `2026-02-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
        ),
      ),
      ...Array.from({ length: 5 }, (_unused, index) =>
        node(`new-${index}`, "parent", "2026-08-01T00:00:00Z"),
      ),
    ];
    const newIds = Array.from({ length: 5 }, (_unused, index) => `new-${index}`);
    const pairs = fallbackCandidatePairs(nodes, newIds, 5);
    // 5 new nodes x (<=8 siblings + <=5 recent, deduplicated) — bounded, and far below the
    // 200 pairs the unbounded version produced.
    expect(pairs.length).toBeLessThanOrEqual(5 * (MAX_FALLBACK_SIBLINGS + 5));
    expect(pairs.length).toBeLessThan(200);
  });
});
