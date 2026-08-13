/**
 * Purpose: unit tests for the summed-retrievability trend — decay across samples, multi-node
 * sums, samples before a node's first sighting, and the empty case.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeRetentionSumSeries } from "./series";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE = Date.parse("2026-07-01T00:00:00Z");

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

/** Every call site below already knows the index exists by construction — this fails loudly
 * instead of leaning on a non-null assertion. */
function valueAt(series: readonly number[], index: number): number {
  const value = series[index];
  if (value === undefined) throw new Error(`expected index ${index} to exist`);
  return value;
}

describe("computeRetentionSumSeries", () => {
  it("returns an empty array for no samples", () => {
    expect(computeRetentionSumSeries([], [])).toEqual([]);
  });

  it("returns all zeros when there are no sightings", () => {
    expect(computeRetentionSumSeries([], [isoAt(0), isoAt(10)])).toEqual([0, 0]);
  });

  it("decays across samples after a single sighting", () => {
    const sightings = [sighting("a", 0, 0)];
    const series = computeRetentionSumSeries(sightings, [isoAt(1), isoAt(60)]);
    const soon = valueAt(series, 0);
    const later = valueAt(series, 1);
    expect(soon).toBeGreaterThan(0.9);
    expect(later).toBeLessThan(soon);
  });

  it("is 0 for a sample before the node's first sighting", () => {
    const sightings = [sighting("a", 30, 0)];
    const series = computeRetentionSumSeries(sightings, [isoAt(0), isoAt(30)]);
    expect(valueAt(series, 0)).toBe(0);
    expect(valueAt(series, 1)).toBeGreaterThan(0.9);
  });

  it("sums retention across multiple nodes at each sample", () => {
    const sightings = [sighting("a", 0, 0), sighting("b", 0, 1)];
    const sum = valueAt(computeRetentionSumSeries(sightings, [isoAt(1)]), 0);
    const single = valueAt(computeRetentionSumSeries([sighting("a", 0, 0)], [isoAt(1)]), 0);
    expect(sum).toBeCloseTo(single * 2, 5);
  });

  it("does not require samples to be pre-sorted", () => {
    const sightings = [sighting("a", 0, 0)];
    const outOfOrder = computeRetentionSumSeries(sightings, [isoAt(60), isoAt(1)]);
    const sorted = computeRetentionSumSeries(sightings, [isoAt(1), isoAt(60)]);
    expect(valueAt(outOfOrder, 0)).toBeCloseTo(valueAt(sorted, 1), 5);
    expect(valueAt(outOfOrder, 1)).toBeCloseTo(valueAt(sorted, 0), 5);
  });
});
