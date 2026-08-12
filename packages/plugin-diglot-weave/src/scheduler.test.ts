/**
 * Purpose: tests for the weave scheduler — density budget, dispersion, new-word throttle,
 * review-over-new priority and determinism (spec 033, acceptance 4).
 */
import { Rating } from "ts-fsrs";
import { describe, expect, it } from "vitest";
import type { CandidateOccurrence } from "./candidates";
import { newWordCard, reviewCard } from "./memoryState";
import { adaptiveNewWordCap, type ScheduleInput, scheduleReplacements } from "./scheduler";

const NOW = new Date("2026-08-12T12:00:00.000Z");

function candidate(lemma: string, clauseIndex: number, start: number): CandidateOccurrence {
  return { lemma, surface: lemma, start, end: start + lemma.length, clauseIndex };
}

/** A card whose recall has decayed for `days` days since one Good review. */
function agedCard(days: number) {
  const reviewedAt = new Date(NOW.getTime() - days * 24 * 3600 * 1000);
  return reviewCard(newWordCard(reviewedAt), reviewedAt, Rating.Good);
}

function baseInput(overrides: Partial<ScheduleInput>): ScheduleInput {
  return {
    candidates: [],
    cardsByLemma: new Map(),
    now: NOW,
    totalWordCount: 100,
    density: 0.02,
    newWordBudgetToday: 5,
    introductionRank: new Map(),
    ...overrides,
  };
}

describe("scheduleReplacements", () => {
  it("returns nothing for short messages (no budget below 20 words)", () => {
    const input = baseInput({
      candidates: [candidate("alpha", 0, 0)],
      cardsByLemma: new Map([["alpha", agedCard(30)]]),
      totalWordCount: 10,
    });
    expect(scheduleReplacements(input)).toEqual([]);
  });

  it("caps replacements by the density budget", () => {
    const candidates = [0, 1, 2, 3, 4].map((n) => candidate(`w${n}`, n, n * 10));
    const cards = new Map(candidates.map((c) => [c.lemma, agedCard(30)]));
    const input = baseInput({ candidates, cardsByLemma: cards, totalWordCount: 100 });
    // floor(100 × 0.02) = 2
    expect(scheduleReplacements(input)).toHaveLength(2);
  });

  it("never places two replacements in the same clause", () => {
    const candidates = [candidate("alpha", 0, 0), candidate("beta", 0, 10)];
    const cards = new Map(candidates.map((c) => [c.lemma, agedCard(30)]));
    const input = baseInput({ candidates, cardsByLemma: cards, totalWordCount: 200 });
    expect(scheduleReplacements(input)).toHaveLength(1);
  });

  it("prefers overdue reviews over fresh ones and orders output by position", () => {
    const candidates = [candidate("fresh", 0, 0), candidate("overdue", 1, 10)];
    const cards = new Map([
      ["fresh", agedCard(0)],
      ["overdue", agedCard(60)],
    ]);
    const input = baseInput({
      candidates,
      cardsByLemma: cards,
      totalWordCount: 50,
      density: 0.02,
    });
    const chosen = scheduleReplacements(input);
    expect(chosen).toHaveLength(1);
    expect(chosen[0]?.lemma).toBe("overdue");
  });

  it("introduces at most one new word, by introduction rank, only with budget", () => {
    const candidates = [candidate("novel", 0, 0), candidate("rarer", 1, 10)];
    const ranks = new Map([
      ["novel", 10],
      ["rarer", 20],
    ]);
    const chosen = scheduleReplacements(
      baseInput({ candidates, introductionRank: ranks, totalWordCount: 200 }),
    );
    expect(chosen).toHaveLength(1);
    expect(chosen[0]?.kind).toBe("new");
    expect(chosen[0]?.lemma).toBe("novel");
    const noBudget = scheduleReplacements(
      baseInput({
        candidates,
        introductionRank: ranks,
        totalWordCount: 200,
        newWordBudgetToday: 0,
      }),
    );
    expect(noBudget).toEqual([]);
  });

  it("ranks a due review above a new word when both compete for one slot", () => {
    const candidates = [candidate("due", 0, 0), candidate("novel", 1, 10)];
    const input = baseInput({
      candidates,
      cardsByLemma: new Map([["due", agedCard(45)]]),
      introductionRank: new Map([["novel", 1]]),
      totalWordCount: 30,
    });
    const chosen = scheduleReplacements(input);
    expect(chosen).toHaveLength(1);
    expect(chosen[0]?.lemma).toBe("due");
  });

  it("is deterministic for identical input", () => {
    const candidates = [0, 1, 2, 3].map((n) => candidate(`w${n}`, n, n * 10));
    const cards = new Map(candidates.map((c) => [c.lemma, agedCard(30)]));
    const input = baseInput({ candidates, cardsByLemma: cards, totalWordCount: 150 });
    expect(scheduleReplacements(input)).toEqual(scheduleReplacements(input));
  });
});

describe("adaptiveNewWordCap", () => {
  it("tightens with review debt and floors at zero", () => {
    expect(adaptiveNewWordCap(5, 0)).toBe(5);
    expect(adaptiveNewWordCap(5, 25)).toBe(3);
    expect(adaptiveNewWordCap(5, 200)).toBe(0);
  });
});
