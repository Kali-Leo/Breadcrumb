/**
 * Purpose: tests for behavioral placement — exposures never move the floor on their own,
 * clean reads inside a worked-through message do, first-encounter lookups move it back, the
 * evidence ceiling holds, and the pair converges on a simulated learner's true boundary
 * (spec 033, audit 2026-08-28 #2).
 */
import { describe, expect, it } from "vitest";
import {
  createPlacementTracker,
  INITIAL_PLACEMENT_STEP,
  type PlacementLimits,
  type PlacementSignal,
  type PlacementState,
  RANKS_CLAIMED_PER_INTRODUCED_WORD,
  updatePlacement,
} from "./placement";

const QUEUE = 4888;
/** Enough introduced words that the evidence ceiling never binds in a given test. */
const AMPLE: PlacementLimits = { queueLength: QUEUE, introducedWordCount: 1000 };
const fresh: PlacementState = {
  introductionRankFloor: 0,
  placementStep: INITIAL_PLACEMENT_STEP,
};

function signal(partial: Partial<PlacementSignal>): PlacementSignal {
  return {
    kind: "exposure",
    lemma: "word",
    messageId: "m1",
    wordRank: 0,
    firstEncounter: true,
    ...partial,
  };
}

describe("updatePlacement", () => {
  it("jumps the floor past a cleanly read word, doubling the step", () => {
    const next = updatePlacement(fresh, { kind: "clean-read", wordRank: 0 }, AMPLE);
    expect(next.introductionRankFloor).toBe(INITIAL_PLACEMENT_STEP);
    expect(next.placementStep).toBe(INITIAL_PLACEMENT_STEP * 2);
  });

  it("moves the floor BACK by the current step on a first-encounter lookup", () => {
    const state: PlacementState = { introductionRankFloor: 500, placementStep: 240 };
    const next = updatePlacement(state, { kind: "lookup", wordRank: 500 }, AMPLE);
    expect(next.introductionRankFloor).toBe(260);
    expect(next.placementStep).toBe(INITIAL_PLACEMENT_STEP);
  });

  it("never lets the floor go below zero", () => {
    const state: PlacementState = { introductionRankFloor: 10, placementStep: 1000 };
    expect(
      updatePlacement(state, { kind: "lookup", wordRank: 10 }, AMPLE).introductionRankFloor,
    ).toBe(0);
  });

  it("caps the floor at the evidence ceiling and does not bank the doubling", () => {
    const limits: PlacementLimits = { queueLength: QUEUE, introducedWordCount: 3 };
    const ceiling = 3 * RANKS_CLAIMED_PER_INTRODUCED_WORD;
    const state: PlacementState = { introductionRankFloor: ceiling, placementStep: 240 };
    const next = updatePlacement(state, { kind: "clean-read", wordRank: ceiling }, limits);
    expect(next.introductionRankFloor).toBe(ceiling);
    expect(next.placementStep).toBe(240);
  });

  it("pulls a floor left over from the old ratchet back under the ceiling", () => {
    const limits: PlacementLimits = { queueLength: QUEUE, introducedWordCount: 5 };
    const state: PlacementState = { introductionRankFloor: QUEUE - 1, placementStep: 1000 };
    const next = updatePlacement(state, { kind: "clean-read", wordRank: 0 }, limits);
    expect(next.introductionRankFloor).toBe(5 * RANKS_CLAIMED_PER_INTRODUCED_WORD);
  });

  it("never pushes the floor past the queue end", () => {
    const limits: PlacementLimits = { queueLength: QUEUE, introducedWordCount: 100000 };
    const state: PlacementState = { introductionRankFloor: QUEUE - 5, placementStep: 1000 };
    const next = updatePlacement(state, { kind: "clean-read", wordRank: QUEUE - 5 }, limits);
    expect(next.introductionRankFloor).toBe(QUEUE - 1);
  });
});

describe("placement tracker", () => {
  it("never moves the floor on exposures alone, however many arrive", () => {
    const tracker = createPlacementTracker();
    let state = fresh;
    for (let index = 0; index < 20; index += 1) {
      state = tracker.fold(
        state,
        signal({ lemma: `w${index}`, messageId: `m${index}`, wordRank: index * 10 }),
        AMPLE,
      );
    }
    expect(state).toEqual(fresh);
  });

  it("counts an unlooked-up word as a clean read once another word of the message is worked on", () => {
    const tracker = createPlacementTracker();
    // Production shape: one first-encounter word plus review words the learner may look up.
    let state = tracker.fold(state0(), signal({ lemma: "a", wordRank: 100 }), AMPLE);
    expect(state.introductionRankFloor).toBe(0);
    state = tracker.fold(
      state,
      signal({ kind: "hover", lemma: "b", wordRank: 20, firstEncounter: false }),
      AMPLE,
    );
    expect(state.introductionRankFloor).toBe(100 + INITIAL_PLACEMENT_STEP);
    expect(state.placementStep).toBe(INITIAL_PLACEMENT_STEP * 2);
  });

  it("does not count the looked-up word itself as a clean read", () => {
    const tracker = createPlacementTracker();
    let state: PlacementState = { introductionRankFloor: 100, placementStep: 60 };
    state = tracker.fold(state, signal({ lemma: "a", wordRank: 100 }), AMPLE);
    state = tracker.fold(state, signal({ kind: "hover", lemma: "a", wordRank: 100 }), AMPLE);
    expect(state.introductionRankFloor).toBe(40);
    expect(state.placementStep).toBe(INITIAL_PLACEMENT_STEP);
  });

  it("ignores exposures replayed for words that already have history", () => {
    // A restarted session re-fires viewport exposures for old messages: no fresh evidence.
    const tracker = createPlacementTracker();
    let state = tracker.fold(
      state0(),
      signal({ lemma: "a", wordRank: 100, firstEncounter: false }),
      AMPLE,
    );
    state = tracker.fold(
      state,
      signal({ kind: "hover", lemma: "b", wordRank: 20, firstEncounter: false }),
      AMPLE,
    );
    expect(state.introductionRankFloor).toBe(0);
  });

  it("only resets the stride when a guess card is dismissed", () => {
    const tracker = createPlacementTracker();
    const state: PlacementState = { introductionRankFloor: 500, placementStep: 240 };
    const next = tracker.fold(
      state,
      signal({ kind: "guess_abandoned", lemma: "a", wordRank: 500 }),
      AMPLE,
    );
    expect(next.introductionRankFloor).toBe(500);
    expect(next.placementStep).toBe(INITIAL_PLACEMENT_STEP);
  });

  it("converges on a simulated learner's boundary and stays there", () => {
    const trueBoundary = 1200; // the learner knows the first 1200 queue words
    const tracker = createPlacementTracker();
    let state = fresh;
    for (let round = 0; round < 60; round += 1) {
      const rank = state.introductionRankFloor;
      const knows = rank < trueBoundary;
      const messageId = `m${round}`;
      // Every message: the new word at the floor, plus a companion word the learner works
      // on (that is what makes the message count as read, not scrolled).
      state = tracker.fold(state, signal({ lemma: "new", messageId, wordRank: rank }), AMPLE);
      state = tracker.fold(
        state,
        knows
          ? signal({
              kind: "hover",
              lemma: "review",
              messageId,
              wordRank: 5,
              firstEncounter: false,
            })
          : signal({ kind: "hover", lemma: "new", messageId, wordRank: rank }),
        AMPLE,
      );
    }
    expect(state.introductionRankFloor).toBeGreaterThan(trueBoundary - 200);
    expect(state.introductionRankFloor).toBeLessThanOrEqual(trueBoundary);
  });
});

function state0(): PlacementState {
  return { ...fresh };
}
