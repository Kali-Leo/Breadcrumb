/**
 * Purpose: unit tests for the three-layer knowledge estimate — empty input, claim-free
 * understanding, the claim-instant boundary, the intuition AND-gate (stability + productive
 * use), and forgetting pulling all three layers down over time.
 */
import type { MasteryClaimRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeKnowledgeLayerSeries, INTUITION_STABILITY_THRESHOLD_DAYS } from "./layers";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE = Date.parse("2026-01-01T00:00:00Z");

function isoAt(offsetDays: number): string {
  return new Date(BASE + offsetDays * DAY_MS).toISOString();
}

function sighting(nodeId: string, offsetDays: number, index: number): NodeSightingRow {
  return {
    id: `s-${nodeId}-${index}`,
    node_id: nodeId,
    conversation_id: "c1",
    message_id: null,
    created_at: isoAt(offsetDays),
  };
}

function claim(
  nodeId: string,
  level: MasteryClaimRow["level"],
  offsetDays: number,
): MasteryClaimRow {
  return {
    id: `cl-${nodeId}-${offsetDays}`,
    node_id: nodeId,
    level,
    source: "self-report",
    created_at: isoAt(offsetDays),
  };
}

/** Three FSRS reviews spaced widely enough (retention.ts semantics) that stability crosses
 * INTUITION_STABILITY_THRESHOLD_DAYS by the third checkpoint — measured empirically at
 * ~52 days of stability, well past the 30-day gate. */
function durableSightings(nodeId: string): NodeSightingRow[] {
  return [sighting(nodeId, 0, 0), sighting(nodeId, 5, 1), sighting(nodeId, 15, 2)];
}

function firstOf<T>(items: readonly T[]): T {
  const value = items[0];
  if (value === undefined) throw new Error("expected a non-empty array");
  return value;
}

describe("computeKnowledgeLayerSeries", () => {
  it("returns an empty array when there are no sample instants", () => {
    const series = computeKnowledgeLayerSeries({
      sightings: [],
      claims: [],
      productiveUseTimesByNode: new Map(),
      sampleInstantsIso: [],
    });
    expect(series).toEqual([]);
  });

  it("is all zero across every layer with no sightings", () => {
    const series = computeKnowledgeLayerSeries({
      sightings: [],
      claims: [],
      productiveUseTimesByNode: new Map(),
      sampleInstantsIso: [isoAt(0), isoAt(10)],
    });
    for (const point of series) {
      expect(point).toEqual({ memory: 0, understanding: 0, intuition: 0 });
    }
  });

  it("leaves understanding at 0 when a node has memory but no claim", () => {
    const series = computeKnowledgeLayerSeries({
      sightings: [sighting("a", 0, 0)],
      claims: [],
      productiveUseTimesByNode: new Map(),
      sampleInstantsIso: [isoAt(1)],
    });
    expect(firstOf(series).memory).toBeGreaterThan(0);
    expect(firstOf(series).understanding).toBe(0);
  });

  it("excludes a claim created after the sample instant, includes one created at-or-before it", () => {
    const sightings = [sighting("a", 0, 0)];
    const claims = [claim("a", "learned", 5)];
    const series = computeKnowledgeLayerSeries({
      sightings,
      claims,
      productiveUseTimesByNode: new Map(),
      sampleInstantsIso: [isoAt(3), isoAt(5), isoAt(6)],
    });
    expect(series[0]?.understanding).toBe(0); // before the claim
    expect(series[1]?.understanding).toBeGreaterThan(0); // exactly at the claim instant
    expect(series[2]?.understanding).toBeGreaterThan(0); // after the claim
  });

  it("does not light up intuition on stability alone, without a recorded productive use", () => {
    const series = computeKnowledgeLayerSeries({
      sightings: durableSightings("durable"),
      claims: [],
      productiveUseTimesByNode: new Map(),
      sampleInstantsIso: [isoAt(20)],
    });
    expect(firstOf(series).memory).toBeGreaterThan(0);
    expect(firstOf(series).intuition).toBe(0);
  });

  it("does not light up intuition on productive use alone, before stability settles", () => {
    const series = computeKnowledgeLayerSeries({
      sightings: [sighting("shallow", 0, 0)],
      claims: [],
      productiveUseTimesByNode: new Map([["shallow", [isoAt(0)]]]),
      sampleInstantsIso: [isoAt(1)],
    });
    expect(firstOf(series).memory).toBeGreaterThan(0);
    expect(firstOf(series).intuition).toBe(0);
  });

  it("lights up intuition once both stability and a prior productive use are satisfied", () => {
    const series = computeKnowledgeLayerSeries({
      sightings: durableSightings("durable"),
      claims: [],
      productiveUseTimesByNode: new Map([["durable", [isoAt(16)]]]),
      sampleInstantsIso: [isoAt(20)],
    });
    const point = firstOf(series);
    expect(point.intuition).toBeGreaterThan(0);
    expect(point.intuition).toBeLessThanOrEqual(point.memory + 1e-9);
  });

  it("does not count a productive use recorded after the sample instant", () => {
    const series = computeKnowledgeLayerSeries({
      sightings: durableSightings("durable"),
      claims: [],
      productiveUseTimesByNode: new Map([["durable", [isoAt(25)]]]),
      sampleInstantsIso: [isoAt(20)],
    });
    expect(firstOf(series).intuition).toBe(0);
  });

  it("exposes the 30-day intuition threshold as a named constant", () => {
    expect(INTUITION_STABILITY_THRESHOLD_DAYS).toBe(30);
  });

  it("decays all three layers as forgetting proceeds, with no new evidence", () => {
    const sightings = durableSightings("durable");
    const claims = [claim("durable", "learned", 0)];
    const productiveUseTimesByNode = new Map([["durable", [isoAt(16)]]]);
    const series = computeKnowledgeLayerSeries({
      sightings,
      claims,
      productiveUseTimesByNode,
      sampleInstantsIso: [isoAt(20), isoAt(200)],
    });
    const soon = firstOf(series);
    const later = series[1];
    if (later === undefined) throw new Error("expected a second point");
    expect(soon.memory).toBeGreaterThan(later.memory);
    expect(soon.understanding).toBeGreaterThan(later.understanding);
    expect(soon.intuition).toBeGreaterThan(later.intuition);
  });
});
