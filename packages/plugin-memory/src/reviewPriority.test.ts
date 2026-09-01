/**
 * Purpose: relative-assertion tests for the concept-side review ordering — what matters is
 * the ranking between memory profiles, not the numbers. Fixed NOW for determinism.
 */
import type { NodeSightingGrade, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeNodeMemoryByNode, computeNodeReviewPriority } from "./reviewPriority";

const NOW = "2026-07-29T12:00:00Z";

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

function graded(days: number, grade: NodeSightingGrade) {
  return { createdAtIso: daysAgo(days), grade };
}

function sighting(nodeId: string, days: number, grade: NodeSightingGrade): NodeSightingRow {
  return {
    id: `${nodeId}-${days}`,
    node_id: nodeId,
    message_id: "m",
    created_at: daysAgo(days),
    grade,
  } as NodeSightingRow;
}

/** Learned a while back, met a second time, then left alone for six weeks — the profile the
 * daily helpers exist for. */
const LEARNED_AND_LEFT = [graded(60, "good"), graded(45, "good")];

describe("computeNodeReviewPriority", () => {
  it("is zero for a node with no footprint", () => {
    expect(computeNodeReviewPriority([], NOW)).toBe(0);
  });

  it("puts a concept learned and then left alone above one met yesterday", () => {
    const justMet = computeNodeReviewPriority([graded(30, "good"), graded(1, "good")], NOW);
    expect(computeNodeReviewPriority(LEARNED_AND_LEFT, NOW)).toBeGreaterThan(justMet);
  });

  it("does not put the most deeply forgotten concept first — the point of the change", () => {
    // Left for over a year, and the last attempt already failed: the likely outcome today is
    // a blank stare, which buys almost no stability however overdue it looks.
    const nearlyGone = computeNodeReviewPriority([graded(400, "good"), graded(380, "again")], NOW);
    expect(computeNodeReviewPriority(LEARNED_AND_LEFT, NOW)).toBeGreaterThan(nearlyGone);
  });

  it("does not hound a concept whose retrieval failed a few days ago", () => {
    const justFailed = computeNodeReviewPriority([graded(30, "good"), graded(5, "again")], NOW);
    expect(computeNodeReviewPriority(LEARNED_AND_LEFT, NOW)).toBeGreaterThan(justFailed);
  });

  it("prefers the one left longer when two concepts have the same history shape", () => {
    const leftLonger = computeNodeReviewPriority([graded(60, "good"), graded(45, "good")], NOW);
    const leftBriefly = computeNodeReviewPriority([graded(30, "good"), graded(15, "good")], NOW);
    expect(leftLonger).toBeGreaterThan(leftBriefly);
  });
});

describe("computeNodeMemoryByNode", () => {
  it("returns both numbers per node from one replay, matching the standalone scorer", () => {
    const rows = [sighting("a", 60, "good"), sighting("a", 45, "good"), sighting("b", 2, "good")];
    const memory = computeNodeMemoryByNode(rows, NOW);
    expect([...memory.keys()].sort()).toEqual(["a", "b"]);
    const a = memory.get("a");
    expect(a?.retention).toBeGreaterThan(0);
    expect(a?.retention).toBeLessThanOrEqual(1);
    expect(a?.reviewPriority).toBeCloseTo(computeNodeReviewPriority(LEARNED_AND_LEFT, NOW), 10);
    expect(memory.get("b")?.reviewPriority).toBeLessThan(a?.reviewPriority ?? 0);
  });
});
