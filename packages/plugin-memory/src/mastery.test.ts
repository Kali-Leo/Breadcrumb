/**
 * Purpose: relative-assertion tests for computeMastery — real footprints beat self-report,
 * self-report beats nothing, and both fade with neglect. Fixed NOW for determinism.
 */
import type { MasteryClaimRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeMastery, DIM_THRESHOLD, LIT_THRESHOLD, masteryTier } from "./mastery";

const NOW = "2026-07-29T12:00:00Z";

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

function sighting(nodeId: string, createdAt: string): NodeSightingRow {
  return {
    id: `s-${nodeId}-${createdAt}`,
    node_id: nodeId,
    conversation_id: "c1",
    message_id: null,
    created_at: createdAt,
    origin_node_id: null,
  };
}

function claim(
  nodeId: string,
  level: MasteryClaimRow["level"],
  createdAt: string,
): MasteryClaimRow {
  return {
    id: `cl-${nodeId}-${createdAt}`,
    node_id: nodeId,
    level,
    source: "self-report",
    created_at: createdAt,
  };
}

describe("computeMastery", () => {
  it("ranks: often-resighted node > self-report-only node > no-evidence node", () => {
    const sightings = [
      sighting("resighted", daysAgo(30)),
      sighting("resighted", daysAgo(20)),
      sighting("resighted", daysAgo(10)),
      sighting("resighted", daysAgo(1)),
    ];
    const claims = [claim("self-report-only", "learned", daysAgo(1))];

    const mastery = computeMastery(sightings, claims, NOW);

    const resighted = mastery.get("resighted") ?? 0;
    const selfReportOnly = mastery.get("self-report-only") ?? 0;
    const noEvidence = mastery.get("no-evidence") ?? 0;

    expect(resighted).toBeGreaterThan(selfReportOnly);
    expect(selfReportOnly).toBeGreaterThan(noEvidence);
    expect(noEvidence).toBe(0);
  });

  it("weighs a 'learned' claim above a 'familiar' claim of the same age", () => {
    const claims = [
      claim("learned-node", "learned", daysAgo(1)),
      claim("familiar-node", "familiar", daysAgo(1)),
    ];
    const mastery = computeMastery([], claims, NOW);
    expect(mastery.get("learned-node") ?? 0).toBeGreaterThan(mastery.get("familiar-node") ?? 0);
  });

  it("decays a self-report-only claim over time", () => {
    const claims = [claim("recent", "learned", daysAgo(1)), claim("stale", "learned", daysAgo(90))];
    const mastery = computeMastery([], claims, NOW);
    expect(mastery.get("recent") ?? 0).toBeGreaterThan(mastery.get("stale") ?? 0);
  });

  it("decays a long-neglected sighted node relative to a fresh one", () => {
    const sightings = [sighting("fresh", daysAgo(0)), sighting("neglected", daysAgo(90))];
    const mastery = computeMastery(sightings, [], NOW);
    expect(mastery.get("fresh") ?? 0).toBeGreaterThan(mastery.get("neglected") ?? 0);
  });

  it("never lets self-report push a node above its real-footprint retention ceiling", () => {
    const sightings = [sighting("solid", daysAgo(0))];
    const withoutClaim = computeMastery(sightings, [], NOW).get("solid") ?? 0;
    const withClaim =
      computeMastery(sightings, [claim("solid", "learned", daysAgo(0))], NOW).get("solid") ?? 0;
    expect(withClaim).toBeGreaterThanOrEqual(withoutClaim);
    expect(withClaim).toBeLessThanOrEqual(1);
  });
});

describe("masteryTier", () => {
  it("classifies the three tiers at their boundaries", () => {
    expect(masteryTier(LIT_THRESHOLD)).toBe("lit");
    expect(masteryTier(LIT_THRESHOLD - 0.01)).toBe("dim");
    expect(masteryTier(DIM_THRESHOLD)).toBe("dim");
    expect(masteryTier(DIM_THRESHOLD - 0.01)).toBe("unlit");
  });
});
