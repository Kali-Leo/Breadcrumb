/**
 * Purpose: tests for the concept guess-gate probability — pretest floor for new nodes,
 * recent-reveal zeroing, abandonment damping, the recall-band multiplier, starvation and the
 * 0.6 ceiling (spec 039 acceptance 3, ported from spec 033's guess policy test suite).
 */
import { describe, expect, it } from "vitest";
import { type ConceptGateInput, computeConceptGateProbability } from "./gatePolicy";

const NOW = new Date("2026-08-14T12:00:00.000Z");

function baseInput(overrides: Partial<ConceptGateInput>): ConceptGateInput {
  return {
    retention: 0.7,
    hasExplicitSignal: true,
    lastRevealAt: null,
    now: NOW,
    recentConsecutiveAbandons: 0,
    ...overrides,
  };
}

describe("computeConceptGateProbability", () => {
  it("uses the 0.1 pretest probability for a brand-new node", () => {
    expect(computeConceptGateProbability(baseInput({ retention: null }))).toBeCloseTo(0.1);
  });

  it("is zero right after the summary was revealed", () => {
    const probability = computeConceptGateProbability(
      baseInput({ lastRevealAt: new Date(NOW.getTime() - 60 * 1000) }),
    );
    expect(probability).toBe(0);
  });

  it("is unaffected by a reveal from more than an hour ago", () => {
    const probability = computeConceptGateProbability(
      baseInput({ lastRevealAt: new Date(NOW.getTime() - 61 * 60 * 1000) }),
    );
    expect(probability).toBeGreaterThan(0);
  });

  it("halves after three consecutive abandons", () => {
    const normal = computeConceptGateProbability(baseInput({ hasExplicitSignal: false }));
    const damped = computeConceptGateProbability(
      baseInput({ hasExplicitSignal: false, recentConsecutiveAbandons: 3 }),
    );
    expect(damped).toBeCloseTo(normal / 2);
  });

  it.each([
    [0.99, 0.4],
    [0.9, 1],
    [0.6, 1.5],
    [0.2, 0.8],
  ])("applies the recall-band factor for retention %f", (retention, factor) => {
    const probability = computeConceptGateProbability(
      baseInput({ retention, hasExplicitSignal: true }),
    );
    expect(probability).toBeCloseTo(Math.min(0.25 * factor, 0.6));
  });

  it("raises probability for signal-starved nodes", () => {
    const starved = computeConceptGateProbability(baseInput({ hasExplicitSignal: false }));
    const fed = computeConceptGateProbability(baseInput({ hasExplicitSignal: true }));
    expect(starved).toBeGreaterThan(fed);
  });

  it("clamps to the 0.6 ceiling however the factors stack", () => {
    const maxed = computeConceptGateProbability(
      baseInput({ retention: 0.6, hasExplicitSignal: false }),
    );
    expect(maxed).toBeLessThanOrEqual(0.6);
  });
});
