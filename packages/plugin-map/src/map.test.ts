/**
 * Purpose: unit tests for the map engine — similarity, clustering, tiers, and
 * deterministic layout with related-near / unrelated-far geometry.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { clusterNodes } from "./clustering";
import { computeMapLayout, placeTier } from "./layout";
import { cosineSimilarity } from "./similarity";

function node(id: string, label: string): KnowledgeNodeRow {
  return {
    id,
    parent_id: null,
    label,
    summary: "s",
    created_at: `2026-07-29T00:00:0${id.length}Z`,
  };
}

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors and 0 for orthogonal ones", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("clusterNodes", () => {
  it("groups similar vectors and separates dissimilar ones", () => {
    const clusters = clusterNodes(
      [
        { nodeId: "a", vector: [1, 0, 0] },
        { nodeId: "b", vector: [0.99, 0.1, 0] },
        { nodeId: "c", vector: [0, 0, 1] },
      ],
      0.9,
    );
    const sizes = clusters.map((cluster) => cluster.length).sort();
    expect(sizes).toEqual([1, 2]);
  });
});

describe("placeTier", () => {
  it("grows house -> village -> city with knowledge count", () => {
    expect(placeTier(1)).toBe("house");
    expect(placeTier(3)).toBe("village");
    expect(placeTier(8)).toBe("city");
  });
});

describe("computeMapLayout", () => {
  const nodes = [node("a", "闭包"), node("bb", "作用域"), node("ccc", "光合作用")];
  const embeddings = new Map<string, readonly number[]>([
    ["a", [1, 0, 0.05]],
    ["bb", [0.98, 0.12, 0]],
    ["ccc", [0, 0.05, 1]],
  ]);

  it("puts related knowledge in one place and unrelated across the sea", () => {
    const places = computeMapLayout(nodes, embeddings);
    expect(places).toHaveLength(2);
    const together = places.find((place) => place.nodeIds.length === 2);
    expect(together?.nodeIds.sort()).toEqual(["a", "bb"]);
  });

  it("is deterministic for identical input", () => {
    const first = computeMapLayout(nodes, embeddings);
    const second = computeMapLayout(nodes, embeddings);
    expect(second).toEqual(first);
  });

  it("names a place after its earliest-learned node", () => {
    const places = computeMapLayout(nodes, embeddings);
    const together = places.find((place) => place.nodeIds.length === 2);
    expect(together?.name).toBe("闭包");
  });

  it("skips nodes without embeddings instead of crashing", () => {
    const places = computeMapLayout([...nodes, node("dddd", "无向量")], embeddings);
    expect(places.flatMap((place) => place.nodeIds)).not.toContain("dddd");
  });
});
