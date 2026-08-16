/**
 * Purpose: unit tests for the node-subset series variants — sightings/claims/productive-use
 * rows outside the subset must not leak into the region's heatmap or trend numbers.
 */
import type { MasteryClaimRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeScopedDailyActivity, computeScopedLayerTrendSeries } from "./scopedSeries";

function localIso(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour, 0).toISOString();
}

const TODAY = localIso(2026, 8, 13);

function sighting(id: string, nodeId: string, createdAt: string): NodeSightingRow {
  return {
    id,
    node_id: nodeId,
    conversation_id: "conversation-1",
    message_id: null,
    created_at: createdAt,
    origin_node_id: null,
  };
}

function claim(id: string, nodeId: string, createdAt: string): MasteryClaimRow {
  return { id, node_id: nodeId, level: "learned", source: "self-report", created_at: createdAt };
}

describe("computeScopedDailyActivity", () => {
  it("counts only sightings of nodes inside the subset", () => {
    const cells = computeScopedDailyActivity(
      [
        sighting("s1", "inside", localIso(2026, 8, 12)),
        sighting("s2", "inside", localIso(2026, 8, 12, 20)),
        sighting("s3", "outside", localIso(2026, 8, 12)),
      ],
      new Set(["inside"]),
      { days: 3, todayIso: TODAY },
    );
    const byDate = new Map(cells.map((cell) => [cell.date, cell.count]));
    expect(byDate.get("2026-08-12")).toBe(2);
    expect(byDate.get("2026-08-13")).toBe(0);
  });

  it("returns an all-zero full range when the region has no sightings", () => {
    const cells = computeScopedDailyActivity(
      [sighting("s1", "outside", localIso(2026, 8, 12))],
      new Set(["inside"]),
      { days: 3, todayIso: TODAY },
    );
    expect(cells).toHaveLength(3);
    expect(cells.every((cell) => cell.count === 0)).toBe(true);
  });
});

describe("computeScopedLayerTrendSeries", () => {
  it("drops rows of nodes outside the subset before computing the series", () => {
    const seen = localIso(2026, 8, 10);
    const scoped = computeScopedLayerTrendSeries({
      sightings: [sighting("s1", "inside", seen), sighting("s2", "outside", seen)],
      claims: [claim("c1", "inside", seen), claim("c2", "outside", seen)],
      productiveUseTimesByNode: new Map([
        ["inside", [seen]],
        ["outside", [seen]],
      ]),
      nodeIds: new Set(["inside"]),
      days: 5,
      todayIso: TODAY,
    });
    const insideOnly = computeScopedLayerTrendSeries({
      sightings: [sighting("s1", "inside", seen)],
      claims: [claim("c1", "inside", seen)],
      productiveUseTimesByNode: new Map([["inside", [seen]]]),
      nodeIds: new Set(["inside"]),
      days: 5,
      todayIso: TODAY,
    });
    expect(scoped).toEqual(insideOnly);
    const last = scoped.at(-1);
    expect(last).toBeDefined();
    expect(last?.memory ?? 0).toBeGreaterThan(0);
    // At most one sighted node in scope, so memory can never exceed 1.
    expect(last?.memory ?? 0).toBeLessThanOrEqual(1);
  });

  it("returns an all-zero series for an empty subset", () => {
    const points = computeScopedLayerTrendSeries({
      sightings: [sighting("s1", "outside", localIso(2026, 8, 10))],
      claims: [],
      productiveUseTimesByNode: new Map(),
      nodeIds: new Set<string>(),
      days: 3,
      todayIso: TODAY,
    });
    expect(points).toHaveLength(3);
    expect(points.every((point) => point.memory === 0)).toBe(true);
  });
});
