/**
 * Purpose: unit tests for the fog engine — fresh knowledge is bright, neglected
 * knowledge fades, re-encounters restore it.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeNodeRetention, computeRetentionByNode } from "./retention";

const NOW = "2026-07-29T12:00:00Z";

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("computeNodeRetention", () => {
  it("is near 1 right after learning", () => {
    expect(computeNodeRetention([daysAgo(0)], NOW)).toBeGreaterThan(0.95);
  });

  it("decays substantially after two months untouched", () => {
    const fresh = computeNodeRetention([daysAgo(0)], NOW);
    const stale = computeNodeRetention([daysAgo(60)], NOW);
    expect(stale).toBeLessThan(fresh - 0.15);
  });

  it("recovers when an old memory is recently re-encountered", () => {
    const neglected = computeNodeRetention([daysAgo(60)], NOW);
    const revisited = computeNodeRetention([daysAgo(60), daysAgo(1)], NOW);
    expect(revisited).toBeGreaterThan(neglected);
    expect(revisited).toBeGreaterThan(0.9);
  });

  it("repeated reviews build more durable memory than a single one", () => {
    const once = computeNodeRetention([daysAgo(30)], NOW);
    const spaced = computeNodeRetention([daysAgo(30), daysAgo(20), daysAgo(10)], NOW);
    expect(spaced).toBeGreaterThan(once);
  });

  it("returns 0 for a node without sightings", () => {
    expect(computeNodeRetention([], NOW)).toBe(0);
  });
});

describe("computeRetentionByNode", () => {
  it("groups sightings per node", () => {
    const sighting = (nodeId: string, createdAt: string): NodeSightingRow => ({
      id: `s-${nodeId}-${createdAt}`,
      node_id: nodeId,
      conversation_id: "c1",
      message_id: null,
      created_at: createdAt,
    });
    const retention = computeRetentionByNode(
      [sighting("a", daysAgo(0)), sighting("b", daysAgo(60))],
      NOW,
    );
    expect(retention.get("a")).toBeGreaterThan(retention.get("b") ?? 1);
  });
});
