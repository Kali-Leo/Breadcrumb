/**
 * Purpose: tests for the empirical-Bayes pseudo-count estimate (spec 060 §4) — sharp tastes
 * shrink less, noisy signals shrink more, thin data falls back to the constant, and the
 * clamp holds at both ends.
 */
import type { InterestSignalRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { K_PSEUDO } from "./aggregate";
import { estimatePseudoCount, PSEUDO_COUNT_MAX, PSEUDO_COUNT_MIN } from "./pseudoCount";

function signal(nodeId: string, curiosity: number, index: number): InterestSignalRow {
  return {
    id: `${nodeId}-${index}`,
    node_id: nodeId,
    conversation_id: "c1",
    curiosity,
    confusion: 0,
    boredom: 0,
    confidence: 0.6,
    styles_json: "[]",
    created_at: "2026-08-01T00:00:00Z",
  };
}

/** 25 nodes, node i pinned at curiosity i/25, three identical signals each — sharply
 * distinct nodes, zero within-node noise. */
function sharpTastes(): InterestSignalRow[] {
  return Array.from({ length: 25 }, (_, node) =>
    Array.from({ length: 3 }, (_, index) => signal(`n${node}`, node / 25, index)),
  ).flat();
}

/** 25 nodes all around 0.5 but with alternating per-signal noise — indistinguishable means,
 * loud within-node noise. */
function noisySignals(): InterestSignalRow[] {
  return Array.from({ length: 25 }, (_, node) =>
    Array.from({ length: 4 }, (_, index) => signal(`n${node}`, index % 2 === 0 ? 0.1 : 0.9, index)),
  ).flat();
}

describe("estimatePseudoCount", () => {
  it("shrinks less for sharply distinct, steady tastes", () => {
    expect(estimatePseudoCount(sharpTastes())).toBe(PSEUDO_COUNT_MIN);
  });

  it("shrinks more when signals are indistinguishable noise", () => {
    expect(estimatePseudoCount(noisySignals())).toBe(PSEUDO_COUNT_MAX);
  });

  it("falls back to the cold-start constant with too few signalled nodes", () => {
    const thin = Array.from({ length: 5 }, (_, node) => signal(`n${node}`, 0.5, 0));
    expect(estimatePseudoCount(thin)).toBe(K_PSEUDO);
    expect(estimatePseudoCount([])).toBe(K_PSEUDO);
  });

  it("falls back when almost no node has repeated signals", () => {
    const singles = Array.from({ length: 30 }, (_, node) => signal(`n${node}`, node / 30, 0));
    expect(estimatePseudoCount(singles)).toBe(K_PSEUDO);
  });

  it("stays within the clamp for mixed realistic data", () => {
    const mixed = [...sharpTastes(), ...noisySignals().slice(0, 40)];
    const estimated = estimatePseudoCount(mixed);
    expect(estimated).toBeGreaterThanOrEqual(PSEUDO_COUNT_MIN);
    expect(estimated).toBeLessThanOrEqual(PSEUDO_COUNT_MAX);
  });
});
