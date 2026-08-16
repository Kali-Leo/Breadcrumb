/**
 * Purpose: tests for FSRS state handling — signal→rating mapping (all six signal classes,
 * acceptance 3), exposure tripling, serialization round-trip, review advancement.
 */
import { Rating } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import {
  cardFromJson,
  cardToJson,
  configureDiglotScheduler,
  newWordCard,
  ratingForSignal,
  retrievabilityOf,
  reviewCard,
} from "./memoryState";

const NOW = new Date("2026-08-12T12:00:00.000Z");
const PAIR_A = "zh:en";
const PAIR_B = "ja:en";

describe("ratingForSignal", () => {
  it("rates only every second consecutive exposure as Good", () => {
    expect(ratingForSignal("exposure", [])).toBeNull();
    expect(ratingForSignal("exposure", ["exposure"])).toBe(Rating.Good);
    // A non-exposure event resets the streak.
    expect(ratingForSignal("exposure", ["hover", "exposure"])).toBeNull();
  });

  it("maps lookups and failed guesses to Again, with a grace window for young cards", () => {
    expect(ratingForSignal("hover", [])).toBe(Rating.Again);
    expect(ratingForSignal("hover", [], undefined, 1)).toBeNull();
    expect(ratingForSignal("hover", [], undefined, 5)).toBe(Rating.Again);
    expect(ratingForSignal("guess_wrong", [])).toBe(Rating.Again);
    expect(ratingForSignal("guess_abandoned", [])).toBe(Rating.Again);
  });

  it("maps successful retrieval by strength", () => {
    expect(ratingForSignal("guess_correct", [], 2000)).toBe(Rating.Easy);
    expect(ratingForSignal("guess_correct", [], 20000)).toBe(Rating.Good);
    expect(ratingForSignal("guess_close", [])).toBe(Rating.Hard);
    expect(ratingForSignal("productive_use", [])).toBe(Rating.Easy);
  });

  it("logs audio without an extra rating (hover already carried the failure)", () => {
    expect(ratingForSignal("audio", [])).toBeNull();
  });
});

describe("card lifecycle", () => {
  it("round-trips a card through JSON with dates intact", () => {
    const card = reviewCard(PAIR_A, newWordCard(NOW), NOW, Rating.Good);
    const revived = cardFromJson(cardToJson(card));
    expect(revived.due.getTime()).toBe(card.due.getTime());
    expect(revived.stability).toBe(card.stability);
  });

  it("review pushes due into the future and recall decays over time", () => {
    const card = reviewCard(PAIR_A, newWordCard(NOW), NOW, Rating.Good);
    expect(card.due.getTime()).toBeGreaterThan(NOW.getTime());
    const soon = retrievabilityOf(PAIR_A, card, NOW);
    const later = retrievabilityOf(PAIR_A, card, new Date(NOW.getTime() + 30 * 24 * 3600 * 1000));
    expect(later).toBeLessThan(soon);
  });
});

describe("per-pair scheduler isolation", () => {
  it("configuring one pair's parameters never changes another pair's scheduling", () => {
    const baselineCard = reviewCard(PAIR_B, newWordCard(NOW), NOW, Rating.Good);
    const baselineRecall = retrievabilityOf(
      PAIR_B,
      baselineCard,
      new Date(NOW.getTime() + 10 * 24 * 3600 * 1000),
    );

    // Configure pair A with distinctly different (still valid) FSRS weights.
    configureDiglotScheduler(
      PAIR_A,
      [
        0.2, 0.7, 2.7, 7.7, 5.28, 1.09, 0.99, 0.0, 1.6, 0.11, 1.0, 2.0, 0.06, 0.29, 1.5, 0.15, 1.8,
        0.15, 0.6, 0.15, 0.5,
      ],
    );

    // Pair B, never configured, must still behave exactly as before.
    const afterCard = reviewCard(PAIR_B, newWordCard(NOW), NOW, Rating.Good);
    const afterRecall = retrievabilityOf(
      PAIR_B,
      afterCard,
      new Date(NOW.getTime() + 10 * 24 * 3600 * 1000),
    );
    expect(afterRecall).toBe(baselineRecall);
  });
});
