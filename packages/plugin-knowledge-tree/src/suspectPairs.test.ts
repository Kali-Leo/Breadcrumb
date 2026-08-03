/**
 * Purpose: unit tests for findSuspectSynonymPairs — threshold filtering, alias-link
 * exclusion, and most-similar-first ordering.
 */
import type { KnowledgeNodeRow, NodeEmbeddingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { findSuspectSynonymPairs } from "./suspectPairs";

function node(id: string, label: string): KnowledgeNodeRow {
  return { id, parent_id: null, label, summary: "s", kind: "concept", created_at: "t" };
}

function embeddingRow(nodeId: string, vector: number[]): NodeEmbeddingRow {
  return { node_id: nodeId, model: "test", vector_json: JSON.stringify(vector), created_at: "t" };
}

describe("findSuspectSynonymPairs", () => {
  it("returns a pair whose cosine similarity clears the threshold", () => {
    const nodes = [node("a", "if缩进"), node("b", "if语句为什么要缩进")];
    const embeddings = [embeddingRow("a", [1, 0]), embeddingRow("b", [1, 0])];
    const pairs = findSuspectSynonymPairs(nodes, embeddings, new Map(), 0.85);
    expect(pairs).toEqual([
      {
        nodeAId: "a",
        nodeALabel: "if缩进",
        nodeBId: "b",
        nodeBLabel: "if语句为什么要缩进",
        similarity: 1,
      },
    ]);
  });

  it("excludes a pair below the threshold", () => {
    const nodes = [node("a", "闭包"), node("b", "作用域")];
    const embeddings = [embeddingRow("a", [1, 0]), embeddingRow("b", [0, 1])];
    expect(findSuspectSynonymPairs(nodes, embeddings, new Map(), 0.85)).toEqual([]);
  });

  it("excludes a pair already linked by node_aliases", () => {
    const nodes = [node("a", "if缩进"), node("b", "if语句为什么要缩进")];
    const embeddings = [embeddingRow("a", [1, 0]), embeddingRow("b", [1, 0])];
    const aliasNodeIdByLabel = new Map([["if缩进", "b"]]);
    expect(findSuspectSynonymPairs(nodes, embeddings, aliasNodeIdByLabel, 0.85)).toEqual([]);
  });

  it("skips nodes with no embedding", () => {
    const nodes = [node("a", "闭包"), node("b", "无embedding节点")];
    const embeddings = [embeddingRow("a", [1, 0])];
    expect(findSuspectSynonymPairs(nodes, embeddings, new Map(), 0.85)).toEqual([]);
  });

  it("sorts multiple suspect pairs most-similar first", () => {
    const nodes = [node("a", "A"), node("b", "B"), node("c", "C")];
    const embeddings = [
      embeddingRow("a", [1, 0]),
      embeddingRow("b", [0.9, Math.sqrt(1 - 0.9 ** 2)]),
      embeddingRow("c", [1, 0.01]),
    ];
    const pairs = findSuspectSynonymPairs(nodes, embeddings, new Map(), 0.85);
    expect(pairs.length).toBeGreaterThan(1);
    for (let i = 1; i < pairs.length; i += 1) {
      expect(pairs[i - 1]?.similarity ?? 0).toBeGreaterThanOrEqual(pairs[i]?.similarity ?? 0);
    }
  });
});
