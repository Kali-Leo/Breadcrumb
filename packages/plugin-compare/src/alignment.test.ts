/**
 * Purpose: unit tests for the semantic-alignment engine (spec 024) — candidate thresholding,
 * top-k, the double pruning (string-matched items, already-judged pairs), batch chunking,
 * judge-verdict validation, and the low-confidence scoring rule.
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

/** Unit vectors on axes: identical axis = similarity 1, different axis = 0, mix in between. */
const vec = (x: number, y: number): number[] => [x, y];

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
    ["leaf-a", vec(1, 0)],
    ["leaf-b", vec(0, 1)],
    ["child", vec(1, 0)],
  ]);
  const nodes = [
    { id: "n1", label: "近甲", summary: "" },
    { id: "n2", label: "近乙", summary: "" },
    { id: "n3", label: "无关", summary: "" },
  ];
  const nodeVectors = new Map<string, readonly number[]>([
    ["n1", vec(0.95, 0.05)],
    ["n2", vec(0.05, 0.95)],
    ["n3", vec(0.5, 0.5)], // cosine vs axis ≈ 0.707 < 0.72
  ]);

  it("keeps only above-threshold pairs for unmatched leaves", () => {
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
    expect(keys).not.toContain("leaf-a:n3"); // below threshold
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
    const manyVectors = new Map<string, readonly number[]>(
      manyNodes.map((node) => [node.id, vec(1, 0.01)]),
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
    confidence: "高" as const,
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
    expect(alignmentCountsAsOverlap("same", "高")).toBe(true);
    expect(alignmentCountsAsOverlap("same", "中")).toBe(true);
    expect(alignmentCountsAsOverlap("same", "低")).toBe(false);
    expect(alignmentCountsAsOverlap("different", "高")).toBe(false);
  });
});
