/**
 * Purpose: tests for the guess-probability policy — information-gain shaping, recent-gloss
 * zeroing, abandonment damping and the ceiling (spec 033, acceptance 2).
 */
import { Rating } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import { computeGuessProbability, type GuessPolicyInput } from "./guessPolicy";
import { newWordCard, reviewCard } from "./memoryState";

const NOW = new Date("2026-08-12T12:00:00.000Z");

function agedCard(days: number) {
  const reviewedAt = new Date(NOW.getTime() - days * 24 * 3600 * 1000);
  return reviewCard(newWordCard(reviewedAt), reviewedAt, Rating.Good);
}

function baseInput(overrides: Partial<GuessPolicyInput>): GuessPolicyInput {
  return {
    card: agedCard(10),
    now: NOW,
    level: "standard",
    hasExplicitSignal: true,
    lastGlossSeenAt: null,
    recentConsecutiveAbandons: 0,
    ...overrides,
  };
}

describe("computeGuessProbability", () => {
  it("is zero right after the gloss was revealed", () => {
    const probability = computeGuessProbability(
      baseInput({ lastGlossSeenAt: new Date(NOW.getTime() - 60 * 1000) }),
    );
    expect(probability).toBe(0);
  });

  it("uses the pretest probability for first encounters", () => {
    expect(computeGuessProbability(baseInput({ card: null }))).toBeCloseTo(0.1);
  });

  it("raises probability for signal-starved words", () => {
    const starved = computeGuessProbability(baseInput({ hasExplicitSignal: false }));
    const fed = computeGuessProbability(baseInput({ hasExplicitSignal: true }));
    expect(starved).toBeGreaterThan(fed);
  });

  it("asks mid-band recall more often than near-certain recall", () => {
    const midBand = computeGuessProbability(baseInput({ card: agedCard(10) }));
    const certain = computeGuessProbability(baseInput({ card: agedCard(0) }));
    expect(midBand).toBeGreaterThan(certain);
  });

  it("halves after three consecutive abandons (below the ceiling)", () => {
    const normal = computeGuessProbability(baseInput({ hasExplicitSignal: false, level: "low" }));
    const damped = computeGuessProbability(
      baseInput({ hasExplicitSignal: false, level: "low", recentConsecutiveAbandons: 3 }),
    );
    expect(damped).toBeCloseTo(normal / 2);
  });

  it("clamps to the 0.6 ceiling however the factors stack", () => {
    const maxed = computeGuessProbability(baseInput({ hasExplicitSignal: false, level: "high" }));
    expect(maxed).toBeLessThanOrEqual(0.6);
  });
});
