/**
 * Purpose: deterministic tests for time-decayed interest aggregation and style ranking,
 * with a fixed NOW.
 */
import type { InterestSignalRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { aggregateInterest, aggregateStyles, INTEREST_HALF_LIFE_DAYS } from "./aggregate";

const NOW = "2026-07-29T12:00:00Z";

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

function signal(
  overrides: Partial<InterestSignalRow> & { node_id: string; created_at: string },
): InterestSignalRow {
  return {
    id: `sig-${overrides.node_id}-${overrides.created_at}`,
    conversation_id: "c1",
    curiosity: 0,
    confusion: 0,
    boredom: 0,
    styles_json: "[]",
    ...overrides,
  };
}

describe("aggregateInterest", () => {
  it("weighs recent signals more than old ones for the same node", () => {
    const signals = [
      signal({ node_id: "n1", created_at: daysAgo(0), curiosity: 1 }),
      signal({ node_id: "n1", created_at: daysAgo(60), curiosity: 0 }),
    ];
    const scores = aggregateInterest(signals, NOW);
    expect(scores.get("n1")?.curiosity ?? 0).toBeGreaterThan(0.5);
  });

  it("weights a signal exactly one half-life old at half strength relative to a fresh one", () => {
    const signals = [
      signal({ node_id: "n1", created_at: daysAgo(0), curiosity: 1 }),
      signal({ node_id: "n1", created_at: daysAgo(INTEREST_HALF_LIFE_DAYS), curiosity: 0 }),
    ];
    const scores = aggregateInterest(signals, NOW);
    // weighted average = (1*1 + 0*0.5) / (1 + 0.5) = 2/3
    expect(scores.get("n1")?.curiosity ?? 0).toBeCloseTo(2 / 3, 5);
  });

  it("keeps nodes independent", () => {
    const signals = [
      signal({ node_id: "n1", created_at: daysAgo(0), confusion: 0.9 }),
      signal({ node_id: "n2", created_at: daysAgo(0), boredom: 0.9 }),
    ];
    const scores = aggregateInterest(signals, NOW);
    expect(scores.get("n1")?.boredom).toBe(0);
    expect(scores.get("n2")?.confusion).toBe(0);
  });

  it("returns an empty map for no signals", () => {
    expect(aggregateInterest([], NOW).size).toBe(0);
  });
});

describe("aggregateStyles", () => {
  it("ranks the most-observed style first", () => {
    const signals = [
      signal({
        node_id: "n1",
        created_at: daysAgo(0),
        styles_json: JSON.stringify(["类比", "代码示例"]),
      }),
      signal({ node_id: "n2", created_at: daysAgo(1), styles_json: JSON.stringify(["类比"]) }),
    ];
    const ranking = aggregateStyles(signals);
    expect(ranking[0]).toEqual({ style: "类比", count: 2 });
    expect(ranking[1]).toEqual({ style: "代码示例", count: 1 });
  });

  it("returns an empty ranking when no styles were ever observed", () => {
    expect(aggregateStyles([signal({ node_id: "n1", created_at: daysAgo(0) })])).toEqual([]);
  });
});
