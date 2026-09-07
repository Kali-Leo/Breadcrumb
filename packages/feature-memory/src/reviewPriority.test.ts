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

/** A system clock that went backwards would make ts-fsrs throw FSRSValidationError on the
 * negative delta_t, and memoryStore.refresh() has no catch for it — so one rolled-back clock
 * would stop the whole memory layer, not one node. */
describe("a clock that went backwards", () => {
  // 31 days BEFORE the newest sighting: delta_t = -31, which is what ts-fsrs threw on.
  const AFTER_ROLLBACK = daysAgo(76);

  it("scores instead of throwing when now is earlier than the last sighting", () => {
    expect(() => computeNodeReviewPriority(LEARNED_AND_LEFT, AFTER_ROLLBACK)).not.toThrow();
    expect(Number.isFinite(computeNodeReviewPriority(LEARNED_AND_LEFT, AFTER_ROLLBACK))).toBe(true);
  });

  it("reads a rollback as delta_t = 0 — the same answer as scoring at the last review", () => {
    // No time has passed that this card knows about, so a review buys nothing yet. That is
    // the same instant retentionOf already clamped to 1 for; the two paths now agree, and a
    // rolled-back clock costs the ordering (every gain is 0) instead of the whole layer.
    const atLastReview = computeNodeReviewPriority(LEARNED_AND_LEFT, daysAgo(45));
    expect(computeNodeReviewPriority(LEARNED_AND_LEFT, AFTER_ROLLBACK)).toBeCloseTo(
      atLastReview,
      10,
    );
  });

  it("still returns every node's pair, so the map never comes back empty", () => {
    const rows = [sighting("a", 60, "good"), sighting("a", 45, "good"), sighting("b", 2, "good")];
    const memory = computeNodeMemoryByNode(rows, AFTER_ROLLBACK);
    expect([...memory.keys()].sort()).toEqual(["a", "b"]);
    for (const entry of memory.values()) {
      expect(Number.isFinite(entry.retention)).toBe(true);
      expect(Number.isFinite(entry.reviewPriority)).toBe(true);
    }
  });
});

/** An unparsable created_at must not reach the sort comparators as NaN. */
describe("an unparsable timestamp", () => {
  it("reports 0 for that node rather than NaN", () => {
    const memory = computeNodeMemoryByNode(
      [sighting("bad", 3, "good"), sighting("ok", 30, "good")],
      NOW,
    );
    const withBadRow = computeNodeMemoryByNode(
      [{ ...sighting("bad", 3, "good"), created_at: "not-a-date" }, sighting("ok", 30, "good")],
      NOW,
    );
    expect(withBadRow.get("bad")?.retention).toBe(0);
    expect(withBadRow.get("bad")?.reviewPriority).toBe(0);
    // and the healthy node beside it is untouched
    expect(withBadRow.get("ok")?.retention).toBeCloseTo(memory.get("ok")?.retention ?? -1, 10);
  });
});
