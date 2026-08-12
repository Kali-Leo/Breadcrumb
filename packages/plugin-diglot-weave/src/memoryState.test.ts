/**
 * Purpose: tests for FSRS state handling — signal→rating mapping (all six signal classes,
 * acceptance 3), exposure tripling, serialization round-trip, review advancement.
 */
import { Rating } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import {
  cardFromJson,
  cardToJson,
  newWordCard,
  ratingForSignal,
  retrievabilityOf,
  reviewCard,
} from "./memoryState";

const NOW = new Date("2026-08-12T12:00:00.000Z");

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
    const card = reviewCard(newWordCard(NOW), NOW, Rating.Good);
    const revived = cardFromJson(cardToJson(card));
    expect(revived.due.getTime()).toBe(card.due.getTime());
    expect(revived.stability).toBe(card.stability);
  });

  it("review pushes due into the future and recall decays over time", () => {
    const card = reviewCard(newWordCard(NOW), NOW, Rating.Good);
    expect(card.due.getTime()).toBeGreaterThan(NOW.getTime());
    const soon = retrievabilityOf(card, NOW);
    const later = retrievabilityOf(card, new Date(NOW.getTime() + 30 * 24 * 3600 * 1000));
    expect(later).toBeLessThan(soon);
  });
});
