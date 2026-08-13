/**
 * Purpose: behavioral placement (spec 033,替代自报式校准) — the weave itself measures
 * vocabulary: a newly introduced word read past without a lookup is objective evidence it
 * was already known, so the introduction floor jumps ahead (exponentially while the streak
 * lasts); the first lookup/failed guess on a fresh word resets the step. No self-report.
 * Main exports: updatePlacement, PlacementState, INITIAL_PLACEMENT_STEP.
 */
import type { DiglotEventKind } from "@breadcrumb/core-db";

/** First jump size; doubles per consecutive known-on-sight word, capped below. */
export const INITIAL_PLACEMENT_STEP = 30;
const MAX_PLACEMENT_STEP = 1000;

export interface PlacementState {
  /** New-word introduction starts at this introduction-queue rank. */
  introductionRankFloor: number;
  /** Current jump size (persisted so convergence survives restarts). */
  placementStep: number;
}

/**
 * Folds one signal event on a word's FIRST encounter (card.reps === 0, no prior events)
 * into the placement state. Clean exposure = the learner read the woven word without
 * needing its meaning → known on sight → floor jumps past this word by the current step,
 * and the step doubles. A lookup or failed guess on a fresh word = the knowledge boundary
 * is here or below → the step resets; the floor never moves down (unknown words simply
 * stop it — mild overshoot self-corrects because further floors need further clean reads).
 */
export function updatePlacement(
  state: PlacementState,
  event: { kind: DiglotEventKind; cardReps: number; wordRank: number | null },
  queueLength: number,
): PlacementState {
  if (event.cardReps !== 0 || event.wordRank === null) return state;
  if (event.kind === "exposure") {
    const floor = Math.min(
      Math.max(state.introductionRankFloor, event.wordRank + state.placementStep),
      Math.max(0, queueLength - 1),
    );
    return {
      introductionRankFloor: floor,
      placementStep: Math.min(state.placementStep * 2, MAX_PLACEMENT_STEP),
    };
  }
  if (event.kind === "hover" || event.kind === "guess_wrong" || event.kind === "guess_abandoned") {
    return { ...state, placementStep: INITIAL_PLACEMENT_STEP };
  }
  return state;
}
