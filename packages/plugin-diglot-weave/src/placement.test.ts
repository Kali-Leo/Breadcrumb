/**
 * Purpose: tests for behavioral placement — floor jumps on clean first reads, step resets
 * on first-encounter lookups, and convergence to a simulated learner's true vocabulary
 * boundary within a handful of encounters (spec 033).
 */
import { describe, expect, it } from "vitest";
import { INITIAL_PLACEMENT_STEP, type PlacementState, updatePlacement } from "./placement";

const QUEUE = 4888;

describe("updatePlacement", () => {
  const fresh: PlacementState = { introductionRankFloor: 0, placementStep: INITIAL_PLACEMENT_STEP };

  it("jumps the floor past a word read cleanly on first sight, doubling the step", () => {
    const next = updatePlacement(fresh, { kind: "exposure", cardReps: 0, wordRank: 0 }, QUEUE);
    expect(next.introductionRankFloor).toBe(INITIAL_PLACEMENT_STEP);
    expect(next.placementStep).toBe(INITIAL_PLACEMENT_STEP * 2);
  });

  it("resets the step (not the floor) on a first-encounter lookup", () => {
    const state: PlacementState = { introductionRankFloor: 500, placementStep: 240 };
    const next = updatePlacement(state, { kind: "hover", cardReps: 0, wordRank: 500 }, QUEUE);
    expect(next.introductionRankFloor).toBe(500);
    expect(next.placementStep).toBe(INITIAL_PLACEMENT_STEP);
  });

  it("ignores events on already-learning words and unknown ranks", () => {
    const state: PlacementState = { introductionRankFloor: 100, placementStep: 60 };
    expect(updatePlacement(state, { kind: "exposure", cardReps: 3, wordRank: 100 }, QUEUE)).toBe(
      state,
    );
    expect(updatePlacement(state, { kind: "exposure", cardReps: 0, wordRank: null }, QUEUE)).toBe(
      state,
    );
  });

  it("converges near a simulated learner's true boundary within ~10 encounters", () => {
    const trueBoundary = 1200; // learner knows the first 1200 queue words
    let state: PlacementState = { ...{ introductionRankFloor: 0, placementStep: 30 } };
    let encounters = 0;
    for (let i = 0; i < 40; i += 1) {
      const rank = state.introductionRankFloor; // next new word comes from the floor
      const knows = rank < trueBoundary;
      encounters += 1;
      state = updatePlacement(
        state,
        { kind: knows ? "exposure" : "hover", cardReps: 0, wordRank: rank },
        QUEUE,
      );
      if (!knows && state.introductionRankFloor >= trueBoundary) break;
    }
    expect(state.introductionRankFloor).toBeGreaterThanOrEqual(trueBoundary);
    // Mild overshoot only: within one doubled step of the boundary.
    expect(state.introductionRankFloor).toBeLessThan(trueBoundary + 2000);
    expect(encounters).toBeLessThanOrEqual(12);
  });

  it("never pushes the floor past the queue end", () => {
    const state: PlacementState = { introductionRankFloor: QUEUE - 5, placementStep: 1000 };
    const next = updatePlacement(
      state,
      { kind: "exposure", cardReps: 0, wordRank: QUEUE - 5 },
      QUEUE,
    );
    expect(next.introductionRankFloor).toBe(QUEUE - 1);
  });
});
