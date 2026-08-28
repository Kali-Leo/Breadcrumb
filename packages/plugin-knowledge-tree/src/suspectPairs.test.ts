/**
 * Purpose: unit tests for findSuspectSynonymPairs — relative-gate filtering on vectors shaped
 * like the REAL local model's output (every pair packed between 0.80 and 0.95, measured on the
 * live database 2026-08-28), alias-link exclusion, the already-judged negative cache, and
 * most-similar-first ordering. Synthetic orthogonal vectors are deliberately avoided: that is
 * exactly what hid the absolute-threshold bug for months, because `similarity: 1` vs
 * `similarity: 0` makes any threshold look like it works.
 */
import type { KnowledgeNodeRow, NodeEmbeddingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "./similarityGate";
import { findSuspectSynonymPairs } from "./suspectPairs";

function node(id: string, label: string): KnowledgeNodeRow {
  return { id, parent_id: null, label, summary: "s", kind: "concept", created_at: "t" };
}

function embeddingRow(nodeId: string, vector: number[]): NodeEmbeddingRow {
  return { node_id: nodeId, model: "test", vector_json: JSON.stringify(vector), created_at: "t" };
}

const DIMENSIONS = 8;

/**
 * A vector inside the narrow high-cosine band the real e5 model produces: a shared centroid
 * plus a small lean along one axis. Two vectors leaning along the SAME axis are the genuine
 * near-duplicates (~0.99); any two leaning along different axes still land around 0.82-0.85,
 * i.e. above the old absolute thresholds (0.72 and, for many pairs, 0.85) despite being
 * unrelated. That is the distribution shape the gate has to cope with.
 */
function packedVector(axis: number, lean: number): number[] {
  const base = 1 / Math.sqrt(DIMENSIONS);
  const vector = new Array<number>(DIMENSIONS).fill(base);
  vector[axis % DIMENSIONS] = base + lean;
  return vector;
}

describe("packedVector fixture", () => {
  it("reproduces the real distribution: unrelated pairs still clear the old absolute floors", () => {
    const unrelated = cosineSimilarity(packedVector(0, 0.5), packedVector(1, 0.6));
    expect(unrelated).toBeGreaterThan(0.72); // old ALIGNMENT_CANDIDATE_THRESHOLD: passes
    expect(unrelated).toBeLessThan(0.95);
    const duplicate = cosineSimilarity(packedVector(0, 0.5), packedVector(0, 0.6));
    expect(duplicate).toBeGreaterThan(unrelated);
  });
});

describe("findSuspectSynonymPairs", () => {
  it("keeps only the standout pair when everything else sits in the packed band", () => {
    const nodes = [
      node("a", "if缩进"),
      node("b", "if语句为什么要缩进"),
      ...Array.from({ length: 6 }, (_unused, index) => node(`filler-${index}`, `无关概念${index}`)),
    ];
    const embeddings = [
      embeddingRow("a", packedVector(0, 0.5)),
      embeddingRow("b", packedVector(0, 0.62)),
      ...Array.from({ length: 6 }, (_unused, index) =>
        embeddingRow(`filler-${index}`, packedVector(index + 1, 0.5 + index * 0.02)),
      ),
    ];

    const pairs = findSuspectSynonymPairs({
      nodes,
      embeddings,
      aliasNodeIdByLabel: new Map(),
      judgedPairKeys: new Set(),
    });

    // What an absolute floor would have done on this band, counted rather than assumed:
    const vectors = embeddings.map((row) => JSON.parse(row.vector_json) as number[]);
    let allPairs = 0;
    let passingOldFloor = 0;
    for (let i = 0; i < vectors.length; i += 1) {
      for (let j = i + 1; j < vectors.length; j += 1) {
        allPairs += 1;
        const first = vectors[i];
        const second = vectors[j];
        if (first === undefined || second === undefined) continue;
        if (cosineSimilarity(first, second) >= 0.72) passingOldFloor += 1;
      }
    }
    expect(passingOldFloor).toBe(allPairs); // the 0.72 blocker prunes literally nothing

    expect(pairs[0]?.nodeAId).toBe("a");
    expect(pairs[0]?.nodeBId).toBe("b");
    expect(pairs.length).toBeLessThan(allPairs); // the relative gate actually prunes
  });

  it("excludes a pair already linked by node_aliases", () => {
    const nodes = [node("a", "if缩进"), node("b", "if语句为什么要缩进")];
    const embeddings = [
      embeddingRow("a", packedVector(0, 0.5)),
      embeddingRow("b", packedVector(0, 0.62)),
    ];
    const aliasNodeIdByLabel = new Map([["if缩进", "b"]]);
    expect(
      findSuspectSynonymPairs({
        nodes,
        embeddings,
        aliasNodeIdByLabel,
        judgedPairKeys: new Set(),
      }),
    ).toEqual([]);
  });

  it("excludes a pair already judged, whichever verdict it got (the negative cache)", () => {
    const nodes = [node("a", "if缩进"), node("b", "if语句为什么要缩进")];
    const embeddings = [
      embeddingRow("a", packedVector(0, 0.5)),
      embeddingRow("b", packedVector(0, 0.62)),
    ];
    expect(
      findSuspectSynonymPairs({
        nodes,
        embeddings,
        aliasNodeIdByLabel: new Map(),
        judgedPairKeys: new Set(["a:b"]),
      }),
    ).toEqual([]);
  });

  it("skips nodes with no embedding, and returns nothing when only one node has one", () => {
    const nodes = [node("a", "闭包"), node("b", "无embedding节点")];
    const embeddings = [embeddingRow("a", packedVector(0, 0.5))];
    expect(
      findSuspectSynonymPairs({
        nodes,
        embeddings,
        aliasNodeIdByLabel: new Map(),
        judgedPairKeys: new Set(),
      }),
    ).toEqual([]);
  });

  it("reports each pair once and sorts most-similar first", () => {
    const nodes = [node("a", "A"), node("b", "B"), node("c", "C"), node("d", "D")];
    const embeddings = [
      embeddingRow("a", packedVector(0, 0.5)),
      embeddingRow("b", packedVector(0, 0.62)),
      embeddingRow("c", packedVector(1, 0.5)),
      embeddingRow("d", packedVector(1, 0.58)),
    ];
    const pairs = findSuspectSynonymPairs({
      nodes,
      embeddings,
      aliasNodeIdByLabel: new Map(),
      judgedPairKeys: new Set(),
    });
    const keys = pairs.map((pair) => `${pair.nodeAId}:${pair.nodeBId}`);
    expect(new Set(keys).size).toBe(keys.length); // no direction-duplicated pair
    for (const key of keys) {
      const [first, second] = key.split(":") as [string, string];
      expect(first < second).toBe(true); // normalized order
    }
    for (let index = 1; index < pairs.length; index += 1) {
      expect(pairs[index - 1]?.similarity ?? 0).toBeGreaterThanOrEqual(
        pairs[index]?.similarity ?? 0,
      );
    }
  });

  it("caps each node's partners at topK even when the whole band is equally similar", () => {
    const nodes = Array.from({ length: 8 }, (_unused, index) => node(`n${index}`, `概念${index}`));
    const embeddings = nodes.map((entry, index) =>
      embeddingRow(entry.id, packedVector(index, 0.5)),
    );
    const pairs = findSuspectSynonymPairs({
      nodes,
      embeddings,
      aliasNodeIdByLabel: new Map(),
      judgedPairKeys: new Set(),
      topK: 2,
    });
    // 8 nodes x 2 partners each, deduplicated across directions — far below the 28 pairs a
    // fixed cosine floor would have produced on this band.
    expect(pairs.length).toBeLessThanOrEqual(16);
    expect(pairs.length).toBeLessThan(28);
  });
});
