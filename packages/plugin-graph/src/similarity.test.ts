/**
 * Purpose: unit tests for cosine-similarity candidate ranking and the same-parent/
 * most-recent fallback candidate strategy.
 */
import type { KnowledgeNodeRow, NodeEmbeddingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { fallbackCandidatePairs, rankCandidatePairs } from "./similarity";

function embedding(nodeId: string, vector: number[]): NodeEmbeddingRow {
  return {
    node_id: nodeId,
    model: "multilingual-e5-small",
    vector_json: JSON.stringify(vector),
    created_at: "2026-08-01T10:00:00Z",
  };
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
  it("ranks the closest existing vector first by cosine similarity", () => {
    const embeddings = [
      embedding("new1", [1, 0]),
      embedding("close", [0.9, 0.1]),
      embedding("far", [0, 1]),
    ];
    const pairs = rankCandidatePairs(embeddings, ["new1"], 2);
    expect(pairs.map((pair) => pair.existingNodeId)).toEqual(["close", "far"]);
    expect(pairs[0]?.similarity ?? 0).toBeGreaterThan(pairs[1]?.similarity ?? 1);
  });

  it("caps results at topK per new node", () => {
    const embeddings = [
      embedding("new1", [1, 0]),
      embedding("a", [1, 0]),
      embedding("b", [0.9, 0.1]),
      embedding("c", [0.1, 0.9]),
    ];
    expect(rankCandidatePairs(embeddings, ["new1"], 1)).toHaveLength(1);
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
});
