/**
 * Purpose: unit tests for spec 015 #4's merge planning — normalizeLabel's cosmetic
 * collapsing, planMechanicalMerges' grouping/canonical-picking, and
 * planSynonymVerdictMerges' verdict-to-instruction turn (including the chain guard).
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import {
  type JudgedNodePair,
  normalizeLabel,
  planMechanicalMerges,
  planSynonymVerdictMerges,
} from "./mergePlan";

function node(id: string, label: string, createdAt: string): KnowledgeNodeRow {
  return { id, parent_id: null, label, summary: "s", kind: "concept", created_at: createdAt };
}

describe("normalizeLabel", () => {
  it("strips a trailing full-width parenthetical", () => {
    expect(normalizeLabel("苹果（Apple）")).toBe("苹果");
  });

  it("strips a trailing full-width parenthetical regardless of its case", () => {
    expect(normalizeLabel("苹果（apple）")).toBe("苹果");
  });

  it("strips a trailing half-width parenthetical", () => {
    expect(normalizeLabel("苹果(Apple)")).toBe("苹果");
  });

  it("lowercases latin labels", () => {
    expect(normalizeLabel("JavaScript")).toBe("javascript");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeLabel("  闭包  ")).toBe("闭包");
  });

  it("leaves a label with no trailing parenthetical unchanged besides case/width", () => {
    expect(normalizeLabel("闭包")).toBe("闭包");
  });

  it("keeps a label that is only a parenthetical instead of collapsing to empty", () => {
    expect(normalizeLabel("(Apple)")).toBe("(apple)");
  });
});

describe("planMechanicalMerges", () => {
  it("merges a normalized-label duplicate pair into the earliest-created node", () => {
    const nodes = [
      node("n1", "苹果（Apple）", "2026-08-01T10:00:00Z"),
      node("n2", "苹果", "2026-08-01T09:00:00Z"),
    ];
    const instructions = planMechanicalMerges(nodes);
    expect(instructions).toEqual([
      { canonicalId: "n2", duplicateId: "n1", duplicateLabel: "苹果（Apple）" },
    ]);
  });

  it("skips a group with only one member", () => {
    const nodes = [node("n1", "闭包", "2026-08-01T10:00:00Z")];
    expect(planMechanicalMerges(nodes)).toEqual([]);
  });

  it("folds every duplicate in a group into the single earliest-created canonical", () => {
    const nodes = [
      node("n1", "javascript", "2026-08-01T10:00:00Z"),
      node("n2", "JavaScript", "2026-08-01T08:00:00Z"),
      node("n3", "JAVASCRIPT", "2026-08-01T09:00:00Z"),
    ];
    const instructions = planMechanicalMerges(nodes);
    expect(instructions).toHaveLength(2);
    expect(instructions.every((instruction) => instruction.canonicalId === "n2")).toBe(true);
    expect(instructions.map((instruction) => instruction.duplicateId).sort()).toEqual(["n1", "n3"]);
  });

  it("is deterministic across different input orderings of the same node set", () => {
    const a = node("n1", "苹果（Apple）", "2026-08-01T10:00:00Z");
    const b = node("n2", "苹果", "2026-08-01T09:00:00Z");
    const c = node("n3", "闭包", "2026-08-01T09:30:00Z");
    expect(planMechanicalMerges([a, b, c])).toEqual(planMechanicalMerges([c, b, a]));
  });

  it("does not merge nodes with genuinely different normalized labels", () => {
    const nodes = [
      node("n1", "闭包", "2026-08-01T10:00:00Z"),
      node("n2", "作用域", "2026-08-01T09:00:00Z"),
    ];
    expect(planMechanicalMerges(nodes)).toEqual([]);
  });
});

describe("planSynonymVerdictMerges", () => {
  const nodesById = new Map<string, KnowledgeNodeRow>([
    ["a", node("a", "if缩进", "2026-08-01T10:00:00Z")],
    ["b", node("b", "if语句为什么要缩进", "2026-08-01T09:00:00Z")],
    ["c", node("c", "缩进规则", "2026-08-01T11:00:00Z")],
  ]);

  it("merges a 同一 verdict into the earlier-created node", () => {
    const pairs: JudgedNodePair[] = [{ pairId: "p0", nodeAId: "a", nodeBId: "b" }];
    const instructions = planSynonymVerdictMerges(
      pairs,
      [{ pairId: "p0", verdict: "同一" }],
      nodesById,
    );
    expect(instructions).toEqual([
      { canonicalId: "b", duplicateId: "a", duplicateLabel: "if缩进" },
    ]);
  });

  it("ignores a 不同 verdict", () => {
    const pairs: JudgedNodePair[] = [{ pairId: "p0", nodeAId: "a", nodeBId: "b" }];
    const instructions = planSynonymVerdictMerges(
      pairs,
      [{ pairId: "p0", verdict: "不同" }],
      nodesById,
    );
    expect(instructions).toEqual([]);
  });

  it("ignores a verdict whose pairId is unknown", () => {
    const instructions = planSynonymVerdictMerges(
      [],
      [{ pairId: "missing", verdict: "同一" }],
      nodesById,
    );
    expect(instructions).toEqual([]);
  });

  it("skips a later pair in the same batch once one of its nodes was already merged away", () => {
    // p0: a merges into b (b is older) -> a is deleted. p1 references a again (a chain
    // A~B, A~C) — it must be skipped rather than producing an instruction whose duplicateId
    // no longer exists by the time it would execute.
    const chainedPairs: JudgedNodePair[] = [
      { pairId: "p0", nodeAId: "a", nodeBId: "b" },
      { pairId: "p1", nodeAId: "a", nodeBId: "c" },
    ];
    const instructions = planSynonymVerdictMerges(
      chainedPairs,
      [
        { pairId: "p0", verdict: "同一" },
        { pairId: "p1", verdict: "同一" },
      ],
      nodesById,
    );
    expect(instructions).toEqual([
      { canonicalId: "b", duplicateId: "a", duplicateLabel: "if缩进" },
    ]);
  });
});
