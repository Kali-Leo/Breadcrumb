/**
 * Purpose: unit tests for the semantic-alignment engine (spec 024) — relative-gate candidate
 * selection on vectors shaped like the REAL local model's output, top-k, the double pruning
 * (string-matched items, already-judged pairs), batch chunking, judge-verdict validation, and
 * the low-confidence scoring rule.
 */
import { describe, expect, it } from "vitest";
import {
  ALIGNMENT_TOP_K,
  type AlignmentCandidatePair,
  alignmentCountsAsOverlap,
  alignmentTextOfItem,
  buildAlignmentJudgeMessages,
  chunkPairs,
  generateAlignmentCandidates,
  validateAlignmentVerdicts,
} from "./alignment";
import type { ProfileItemDefinition } from "./profileSchema";

function item(overrides: Partial<ProfileItemDefinition>): ProfileItemDefinition {
  return {
    key: "k",
    parentKey: null,
    label: "条目",
    aliases: [],
    sourceRef: "某资料 · 第一章",
    conceptId: null,
    ...overrides,
  };
}

const DIMENSIONS = 8;

/**
 * A vector inside the narrow high-cosine band the real local e5 model produces (every pair of
 * live nodes measured between 0.802 and 0.949 on 2026-08-28): a shared centroid plus a small
 * lean along one axis. Same axis = near-duplicate; different axes still land around 0.82-0.85,
 * i.e. ABOVE the absolute 0.72 floor this engine used to prune with — which is exactly why
 * that floor turned out to be a no-op on real data and why these tests must not use
 * orthogonal `[1,0]`/`[0,1]` fixtures.
 */
function packedVector(axis: number, lean: number): number[] {
  const base = 1 / Math.sqrt(DIMENSIONS);
  const vector = new Array<number>(DIMENSIONS).fill(base);
  vector[axis % DIMENSIONS] = base + lean;
  return vector;
}

describe("alignmentTextOfItem", () => {
  it("embeds label alone or label with aliases", () => {
    expect(alignmentTextOfItem(item({ label: "数列" }))).toBe("数列");
    expect(
      alignmentTextOfItem(item({ label: "异步基础", aliases: ["Promise", "async/await"] })),
    ).toBe("异步基础（Promise、async/await）");
  });
});

describe("generateAlignmentCandidates", () => {
  const items = [
    item({ key: "leaf-a", label: "甲" }),
    item({ key: "leaf-b", label: "乙" }),
    item({ key: "parent", label: "类目" }),
    item({ key: "child", parentKey: "parent", label: "丙" }),
  ];
  const itemVectors = new Map<string, readonly number[]>([
    ["leaf-a", packedVector(0, 0.5)],
    ["leaf-b", packedVector(1, 0.5)],
    ["child", packedVector(0, 0.5)],
  ]);
  const nodes = [
    { id: "n1", label: "近甲", summary: "" },
    { id: "n2", label: "近乙", summary: "" },
    { id: "n3", label: "无关", summary: "" },
  ];
  const nodeVectors = new Map<string, readonly number[]>([
    ["n1", packedVector(0, 0.62)], // same axis as leaf-a: the real match
    ["n2", packedVector(1, 0.62)], // same axis as leaf-b
    ["n3", packedVector(5, 0.55)], // different axis — still ~0.84 cosine to everything
  ]);

  it("keeps the standout node per leaf and drops the merely-in-band one", () => {
    const pairs = generateAlignmentCandidates({
      items,
      itemVectors,
      nodes,
      nodeVectors,
      judgedPairs: new Set(),
      matchedItemKeys: new Set(),
    });
    const keys = pairs.map((pair) => `${pair.itemKey}:${pair.nodeId}`);
    expect(keys).toContain("leaf-a:n1");
    expect(keys).toContain("leaf-b:n2");
    // n3 is NOT below any absolute floor — its cosine to leaf-a is ~0.84, comfortably past
    // both the old 0.72 and the synonym gate's 0.85-era thinking. Only the relative gate,
    // which sees that n1 is far better for this leaf, rejects it.
    expect(keys).not.toContain("leaf-a:n3");
    expect(keys).not.toContain("parent:n1"); // internal node, never a candidate
  });

  it("prunes already-matched items and already-judged pairs", () => {
    const pairs = generateAlignmentCandidates({
      items,
      itemVectors,
      nodes,
      nodeVectors,
      judgedPairs: new Set(["child:n1"]),
      matchedItemKeys: new Set(["leaf-a"]),
    });
    const keys = pairs.map((pair) => `${pair.itemKey}:${pair.nodeId}`);
    expect(keys.some((key) => key.startsWith("leaf-a:"))).toBe(false);
    expect(keys).not.toContain("child:n1");
  });

  it("caps candidates per item at ALIGNMENT_TOP_K", () => {
    const manyNodes = Array.from({ length: 10 }, (_, index) => ({
      id: `m${index}`,
      label: `节点${index}`,
      summary: "",
    }));
    // Ten equally-good matches: the relative gate cannot separate them (mean === best), so
    // the absolute top-k cap is what has to hold the line.
    const manyVectors = new Map<string, readonly number[]>(
      manyNodes.map((node) => [node.id, packedVector(0, 0.5)]),
    );
    const pairs = generateAlignmentCandidates({
      items: [item({ key: "leaf-a", label: "甲" })],
      itemVectors,
      nodes: manyNodes,
      nodeVectors: manyVectors,
      judgedPairs: new Set(),
      matchedItemKeys: new Set(),
    });
    expect(pairs).toHaveLength(ALIGNMENT_TOP_K);
  });
});

describe("chunkPairs", () => {
  it("splits into batches of the given size", () => {
    expect(chunkPairs([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("buildAlignmentJudgeMessages", () => {
  it("numbers pairs and carries both sides' context", () => {
    const pair: AlignmentCandidatePair = {
      itemKey: "a",
      itemLabel: "异步基础（Promise）",
      itemContext: "MDN · 6.11",
      nodeId: "n1",
      nodeLabel: "事件循环",
      nodeSummary: "JS 并发模型",
      similarity: 0.8,
    };
    const messages = buildAlignmentJudgeMessages([pair]);
    const user = messages.find((message) => message.role === "user");
    expect(user?.content).toContain("对1：A=异步基础（Promise）");
    expect(user?.content).toContain("MDN · 6.11");
    expect(user?.content).toContain("B=事件循环（JS 并发模型）");
  });
});

describe("validateAlignmentVerdicts", () => {
  const verdict = (pair: number) => ({
    pair,
    verdict: "same" as const,
    confidence: "high" as const,
    reason: "同一概念",
  });

  it("accepts a complete 1..n set and orders it", () => {
    const ordered = validateAlignmentVerdicts(2, { verdicts: [verdict(2), verdict(1)] });
    expect(ordered?.map((entry) => entry.pair)).toEqual([1, 2]);
  });

  it("rejects wrong counts, duplicates, and gaps", () => {
    expect(validateAlignmentVerdicts(2, { verdicts: [verdict(1)] })).toBeNull();
    expect(validateAlignmentVerdicts(2, { verdicts: [verdict(1), verdict(1)] })).toBeNull();
    expect(validateAlignmentVerdicts(2, { verdicts: [verdict(1), verdict(3)] })).toBeNull();
  });
});

describe("alignmentCountsAsOverlap", () => {
  it("counts confident sames only", () => {
    expect(alignmentCountsAsOverlap("same", "high")).toBe(true);
    expect(alignmentCountsAsOverlap("same", "medium")).toBe(true);
    expect(alignmentCountsAsOverlap("same", "low")).toBe(false);
    expect(alignmentCountsAsOverlap("different", "high")).toBe(false);
  });
});
