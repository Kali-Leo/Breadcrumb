/**
 * Purpose: unit tests for the fog engine — fresh knowledge is bright, neglected
 * knowledge fades, re-encounters restore it, and a sighting's grade is what FSRS is told.
 */
import type { NodeSightingGrade, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeNodeRetention, computeRetentionByNode, type GradedSighting } from "./retention";

const NOW = "2026-07-29T12:00:00Z";

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

/** A passive exposure — the grade every extraction/re-encounter footprint carries. */
function met(createdAtIso: string): GradedSighting {
  return { createdAtIso, grade: "good" };
}

function graded(createdAtIso: string, grade: NodeSightingGrade): GradedSighting {
  return { createdAtIso, grade };
}

describe("computeNodeRetention", () => {
  it("is near 1 right after learning", () => {
    expect(computeNodeRetention([met(daysAgo(0))], NOW)).toBeGreaterThan(0.95);
  });

  it("decays substantially after two months untouched", () => {
    const fresh = computeNodeRetention([met(daysAgo(0))], NOW);
    const stale = computeNodeRetention([met(daysAgo(60))], NOW);
    expect(stale).toBeLessThan(fresh - 0.15);
  });

  it("recovers when an old memory is recently re-encountered", () => {
    const neglected = computeNodeRetention([met(daysAgo(60))], NOW);
    const revisited = computeNodeRetention([met(daysAgo(60)), met(daysAgo(1))], NOW);
    expect(revisited).toBeGreaterThan(neglected);
    expect(revisited).toBeGreaterThan(0.9);
  });

  it("repeated reviews build more durable memory than a single one", () => {
    const once = computeNodeRetention([met(daysAgo(30))], NOW);
    const spaced = computeNodeRetention(
      [met(daysAgo(30)), met(daysAgo(20)), met(daysAgo(10))],
      NOW,
    );
    expect(spaced).toBeGreaterThan(once);
  });

  it("returns 0 for a node without sightings", () => {
    expect(computeNodeRetention([], NOW)).toBe(0);
  });

  it("orders the four grades: a failed retrieval leaves the least memory, an easy one the most", () => {
    // Same history, same instants — only the last footprint's grade differs, so any ordering
    // here comes from the grade reaching FSRS rather than from the timestamps.
    const history = [met(daysAgo(40)), met(daysAgo(20))];
    const byGrade = (grade: NodeSightingGrade): number =>
      computeNodeRetention([...history, graded(daysAgo(10), grade)], NOW);

    expect(byGrade("again")).toBeLessThan(byGrade("hard"));
    expect(byGrade("hard")).toBeLessThan(byGrade("good"));
    expect(byGrade("good")).toBeLessThan(byGrade("easy"));
  });

  it("lets a failed retrieval pull an otherwise fresh node down", () => {
    const remembered = computeNodeRetention([met(daysAgo(30)), met(daysAgo(3))], NOW);
    const forgotten = computeNodeRetention([met(daysAgo(30)), graded(daysAgo(3), "again")], NOW);
    expect(forgotten).toBeLessThan(remembered);
  });

  it("sorts footprints by time no matter what order they arrive in", () => {
    const inOrder = computeNodeRetention([met(daysAgo(30)), met(daysAgo(1))], NOW);
    const shuffled = computeNodeRetention([met(daysAgo(1)), met(daysAgo(30))], NOW);
    expect(shuffled).toBeCloseTo(inOrder, 10);
  });
});

describe("computeRetentionByNode", () => {
  const sighting = (
    nodeId: string,
    createdAt: string,
    grade?: NodeSightingGrade,
  ): NodeSightingRow => ({
    id: `s-${nodeId}-${createdAt}`,
    node_id: nodeId,
    conversation_id: "c1",
    message_id: null,
    created_at: createdAt,
    origin_node_id: null,
    ...(grade === undefined ? {} : { grade }),
  });

  it("groups sightings per node", () => {
    const retention = computeRetentionByNode(
      [sighting("a", daysAgo(0)), sighting("b", daysAgo(60))],
      NOW,
    );
    expect(retention.get("a")).toBeGreaterThan(retention.get("b") ?? 1);
  });

  it("treats a row with no grade as the passive exposure the insert path would have written", () => {
    const ungraded = computeRetentionByNode([sighting("a", daysAgo(20))], NOW).get("a");
    const explicitGood = computeRetentionByNode([sighting("b", daysAgo(20), "good")], NOW).get("b");
    expect(ungraded).toBeCloseTo(explicitGood ?? -1, 10);
  });

  it("carries each row's own grade into that node's estimate", () => {
    const retention = computeRetentionByNode(
      [
        sighting("failed", daysAgo(20), "again"),
        sighting("mentioned", daysAgo(20), "good"),
        sighting("recalled", daysAgo(20), "easy"),
      ],
      NOW,
    );
    expect(retention.get("failed") ?? 1).toBeLessThan(retention.get("mentioned") ?? 0);
    expect(retention.get("mentioned") ?? 1).toBeLessThan(retention.get("recalled") ?? 0);
  });
});
