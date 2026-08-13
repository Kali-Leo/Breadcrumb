/**
 * Purpose: unit tests for the system gauge — the null fallback below the minimum sample
 * size on both the node and word sides, sample counting inside the 30-day window, and the
 * word-side correct+close ratio.
 */
import type { DiglotWordGuessRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeSystemGauge, MINIMUM_SAMPLE_SIZE, TARGET_RETENTION } from "./systemGauge";

const NOW = "2026-08-13T12:00:00.000Z";

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
  };
}

function guess(
  grade: DiglotWordGuessRow["grade"],
  createdAt: string,
  lemma = "book",
): DiglotWordGuessRow {
  return {
    id: `g-${lemma}-${createdAt}`,
    lemma,
    pair: "zh:en",
    guess: "x",
    grade,
    context: "c",
    latency_ms: 1000,
    created_at: createdAt,
  };
}

describe("computeSystemGauge", () => {
  it("returns null on both sides with zero sample sizes for no data", () => {
    const result = computeSystemGauge({ sightings: [], guesses: [], nowIso: NOW });
    expect(result).toEqual({
      targetRetention: TARGET_RETENTION,
      nodeMeasured: null,
      nodeSampleSize: 0,
      wordMeasured: null,
      wordSampleSize: 0,
    });
  });

  it("keeps nodeMeasured null below the minimum sample size, even with some reencounters", () => {
    // Only 2 nodes reencountered inside the window: below MINIMUM_SAMPLE_SIZE (5).
    const sightings = [
      sighting("a", daysAgo(20)),
      sighting("a", daysAgo(5)),
      sighting("b", daysAgo(20)),
      sighting("b", daysAgo(3)),
    ];
    const result = computeSystemGauge({ sightings, guesses: [], nowIso: NOW });
    expect(result.nodeSampleSize).toBe(2);
    expect(result.nodeMeasured).toBeNull();
  });

  it("reports a nodeMeasured average once the sample reaches the minimum", () => {
    const sightings: NodeSightingRow[] = [];
    for (const nodeId of ["a", "b", "c", "d", "e"]) {
      sightings.push(sighting(nodeId, daysAgo(20)), sighting(nodeId, daysAgo(2)));
    }
    const result = computeSystemGauge({ sightings, guesses: [], nowIso: NOW });
    expect(result.nodeSampleSize).toBe(5);
    expect(result.nodeMeasured).not.toBeNull();
    expect(result.nodeMeasured as number).toBeGreaterThan(0);
    expect(result.nodeMeasured as number).toBeLessThanOrEqual(1);
  });

  it("ignores a node's very first sighting (not a reencounter) and reencounters outside the window", () => {
    const sightings = [
      sighting("a", daysAgo(1)), // first sighting only, no reencounter yet
      sighting("b", daysAgo(90)),
      sighting("b", daysAgo(40)), // reencounter, but outside the 30-day window
    ];
    const result = computeSystemGauge({ sightings, guesses: [], nowIso: NOW });
    expect(result.nodeSampleSize).toBe(0);
  });

  it("computes the word-side correct+close ratio and keeps it null below the minimum sample", () => {
    const guesses = [
      guess("correct", daysAgo(1)),
      guess("close", daysAgo(2)),
      guess("wrong", daysAgo(3)),
    ];
    const belowMinimum = computeSystemGauge({ sightings: [], guesses, nowIso: NOW });
    expect(belowMinimum.wordSampleSize).toBe(3);
    expect(belowMinimum.wordMeasured).toBeNull();

    const padded = [...guesses, guess("correct", daysAgo(4)), guess("wrong", daysAgo(5))];
    const atMinimum = computeSystemGauge({ sightings: [], guesses: padded, nowIso: NOW });
    expect(atMinimum.wordSampleSize).toBe(MINIMUM_SAMPLE_SIZE);
    expect(atMinimum.wordMeasured).toBeCloseTo(3 / 5);
  });

  it("excludes guesses outside the window from the word sample", () => {
    const guesses = [guess("correct", daysAgo(90))];
    const result = computeSystemGauge({ sightings: [], guesses, nowIso: NOW });
    expect(result.wordSampleSize).toBe(0);
  });
});
