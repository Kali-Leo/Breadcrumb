/**
 * Purpose: deterministic tests for time-decayed, confidence-weighted shrinkage aggregation
 * and style ranking, with a fixed NOW.
 */
import type { InterestSignalRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { aggregateInterest, aggregateStyles, INTEREST_HALF_LIFE_DAYS, K_PSEUDO } from "./aggregate";

const NOW = "2026-07-29T12:00:00Z";

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

let signalCounter = 0;
function signal(
  overrides: Partial<InterestSignalRow> & { node_id: string; created_at: string },
): InterestSignalRow {
  signalCounter += 1;
  return {
    id: `sig-${signalCounter}`,
    conversation_id: "c1",
    curiosity: 0,
    confusion: 0,
    boredom: 0,
    confidence: 1,
    styles_json: "[]",
    ...overrides,
  };
}

describe("aggregateInterest", () => {
  it("weighs recent signals more than old ones for the same node", () => {
    const signals = [
      signal({ node_id: "n1", created_at: daysAgo(0), curiosity: 1 }),
      signal({ node_id: "n1", created_at: daysAgo(INTEREST_HALF_LIFE_DAYS), curiosity: 0 }),
    ];
    const scores = aggregateInterest(signals, NOW);
    // weight(new) = 1*1 = 1, weight(old) = 1*0.5 = 0.5 (exactly one half-life old)
    // score = (1*1 + 0*0.5) / (1 + 0.5 + K_PSEUDO) = 1 / 4.5
    expect(scores.get("n1")?.curiosity ?? 0).toBeCloseTo(1 / 4.5, 5);
  });

  it("keeps nodes independent", () => {
    const signals = [
      signal({ node_id: "n1", created_at: daysAgo(0), confusion: 0.9, confidence: 0.9 }),
      signal({ node_id: "n2", created_at: daysAgo(0), boredom: 0.9, confidence: 0.9 }),
    ];
    const scores = aggregateInterest(signals, NOW);
    expect(scores.get("n1")?.boredom).toBe(0);
    expect(scores.get("n2")?.confusion).toBe(0);
  });

  it("returns an empty map for no signals", () => {
    expect(aggregateInterest([], NOW).size).toBe(0);
  });

  it("shrinks a single confident strong signal well below its raw value", () => {
    // Acceptance criterion: one strong (0.9) × high-confidence (0.9) signal aggregates < 0.5.
    const signals = [
      signal({ node_id: "n1", created_at: daysAgo(0), curiosity: 0.9, confidence: 0.9 }),
    ];
    const score = aggregateInterest(signals, NOW).get("n1")?.curiosity ?? 0;
    // (0.9*0.9) / (0.9 + K_PSEUDO)
    expect(score).toBeCloseTo((0.9 * 0.9) / (0.9 + K_PSEUDO), 5);
    expect(score).toBeLessThan(0.5);
  });

  it("weakens the shrinkage pull monotonically as corroborating evidence accumulates, eventually crossing 0.7", () => {
    const scoreForCount = (count: number): number => {
      const signals = Array.from({ length: count }, () =>
        signal({ node_id: "n1", created_at: daysAgo(0), curiosity: 0.9, confidence: 0.9 }),
      );
      return aggregateInterest(signals, NOW).get("n1")?.curiosity ?? 0;
    };
    const scoreOf1 = scoreForCount(1);
    const scoreOf5 = scoreForCount(5);
    const scoreOf20 = scoreForCount(20);
    expect(scoreOf5).toBeGreaterThan(scoreOf1);
    expect(scoreOf20).toBeGreaterThan(scoreOf5);
    // With K_PSEUDO=3 and a confidence cap of 0.9, five identical signals only reach ~0.54
    // (still well under the raw 0.9 value) — twenty are needed to cross 0.7, demonstrating
    // that the shrinkage pull fades but does not vanish after just a handful of samples.
    expect(scoreOf5).toBeCloseTo(0.54, 2);
    expect(scoreOf20).toBeGreaterThan(0.7);
  });

  it("returns evidenceWeight as the sum of confidence x decay across a node's signals", () => {
    const signals = [
      signal({ node_id: "n1", created_at: daysAgo(0), curiosity: 0.6, confidence: 0.9 }),
      signal({ node_id: "n1", created_at: daysAgo(0), curiosity: 0.3, confidence: 0.3 }),
    ];
    const evidenceWeight = aggregateInterest(signals, NOW).get("n1")?.evidenceWeight ?? 0;
    expect(evidenceWeight).toBeCloseTo(1.2, 5);
  });

  it("returns evidenceWeight of 0 only when there are no signals for the node (map has no entry)", () => {
    expect(aggregateInterest([], NOW).get("n1")).toBeUndefined();
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
