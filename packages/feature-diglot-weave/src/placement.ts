/**
 * Purpose: behavioral placement (spec 033, 替代自报式校准) — the weave itself measures
 * vocabulary: a new word read past WHILE the learner was demonstrably reading (they looked
 * another word of the same message up) is evidence it was already known, so the introduction
 * floor moves ahead; a lookup or wrong guess on a fresh word is evidence the boundary is
 * here, so the floor moves BACK. Bidirectional, capped, and never driven by dwell time
 * alone (audit 2026-08-28 #2). No self-report.
 * Main exports: updatePlacement, createPlacementTracker, PlacementState, PlacementSignal,
 * INITIAL_PLACEMENT_STEP, RANKS_CLAIMED_PER_INTRODUCED_WORD.
 */
import type { DiglotEventKind } from "@breadcrumb/core-db";

/** First jump size; doubles per consecutive known-on-sight word, capped below. */
export const INITIAL_PLACEMENT_STEP = 30;
const MAX_PLACEMENT_STEP = 1000;

/** How many queue ranks the floor may claim as "already known" per word actually
 * introduced. Tentative constant: nothing in the literature converts reading behaviour into
 * a calibrated vocabulary size (the measurement instruments are 30-item adaptive tests), so
 * this is a guard rail, not an estimate — it keeps a handful of clean reads from declaring
 * thousands of unseen words known, while still allowing the floor to travel the whole
 * 4888-word zh:en queue after ~120 introduced words. */
export const RANKS_CLAIMED_PER_INTRODUCED_WORD = 40;

/** Message-scoped bookkeeping is capped: a chat scrollback is unbounded, the evidence
 * window is not. */
const MAX_TRACKED_MESSAGES = 20;

export interface PlacementState {
  /** New-word introduction starts at this introduction-queue rank. */
  introductionRankFloor: number;
  /** Current jump size (persisted so convergence survives restarts). */
  placementStep: number;
}

export interface PlacementLimits {
  /** Length of the pack's introduction queue — the floor can never reach its end. */
  queueLength: number;
  /** Words with an FSRS card, i.e. actually introduced — the evidence budget for the cap. */
  introducedWordCount: number;
}

/** What one resolved piece of evidence says about the knowledge boundary. */
export type PlacementMove =
  /** Read past without needing the meaning, in a message the learner was working through. */
  | "clean-read"
  /** Needed the meaning (or guessed wrong) on a first encounter. */
  | "lookup"
  /** Ambiguous (a guess card dismissed) — only the stride goes back to careful. */
  | "reset-step";

/** Highest floor the current evidence can support. */
function floorCeiling(limits: PlacementLimits): number {
  return Math.min(
    Math.max(0, limits.queueLength - 1),
    limits.introducedWordCount * RANKS_CLAIMED_PER_INTRODUCED_WORD,
  );
}

/**
 * Folds one resolved move into the placement state. The floor is bidirectional: it advances
 * past cleanly read words (stride doubling while the streak lasts) and retreats by the
 * current stride when a fresh word turns out to be unknown — a binary search on the
 * knowledge boundary rather than the one-way ratchet that used to self-lock at the queue
 * tail. The ceiling also pulls an over-claimed floor back down, which repairs states already
 * persisted by the ratchet.
 */
export function updatePlacement(
  state: PlacementState,
  move: { kind: PlacementMove; wordRank: number },
  limits: PlacementLimits,
): PlacementState {
  if (move.kind === "reset-step") {
    return { ...state, placementStep: INITIAL_PLACEMENT_STEP };
  }
  const ceiling = floorCeiling(limits);
  if (move.kind === "clean-read") {
    const floor = Math.min(
      Math.max(state.introductionRankFloor, move.wordRank + state.placementStep),
      ceiling,
    );
    const advanced = floor > state.introductionRankFloor;
    return {
      introductionRankFloor: floor,
      // Only a floor that actually moved earned a bigger stride; doubling against the
      // ceiling would bank jumps the evidence never supported.
      placementStep: advanced
        ? Math.min(state.placementStep * 2, MAX_PLACEMENT_STEP)
        : state.placementStep,
    };
  }
  const from = Math.min(state.introductionRankFloor, move.wordRank);
  return {
    introductionRankFloor: Math.min(Math.max(0, from - state.placementStep), ceiling),
    placementStep: INITIAL_PLACEMENT_STEP,
  };
}

/** One signal event as placement sees it. */
export interface PlacementSignal {
  kind: DiglotEventKind;
  lemma: string;
  /** Message the signal happened in — the scope in which "other words were worked on". */
  messageId: string | null;
  /** Introduction-queue rank of the lemma; null when it is not in the queue. */
  wordRank: number | null;
  /** The word had no FSRS reps AND no logged event before this one. Must be decided against
   * the event log, not an in-memory set: a restarted session re-fires viewport exposures for
   * old messages, and those must not count as fresh evidence a second time. */
  firstEncounter: boolean;
}

/** Explicit work on a word: the learner stopped reading and asked for something. */
const EXPLICIT_KINDS: ReadonlySet<DiglotEventKind> = new Set<DiglotEventKind>([
  "hover",
  "audio",
  "guess_correct",
  "guess_close",
  "guess_wrong",
  "guess_abandoned",
]);

/** Explicit kinds that prove the word was NOT known on sight. A dismissed guess card is
 * deliberately absent: closing a card is as often a dismissal as a failure. */
const LOOKUP_KINDS: ReadonlySet<DiglotEventKind> = new Set<DiglotEventKind>([
  "hover",
  "guess_wrong",
]);

export interface PlacementTracker {
  fold(state: PlacementState, signal: PlacementSignal, limits: PlacementLimits): PlacementState;
}

/**
 * Holds first-encounter exposures until the same message produces an explicit interaction on
 * some OTHER word. A viewport exposure on its own means "the bubble was on screen for a
 * second" — the old code let that alone drive the floor, so pure scrolling pushed the floor
 * to the queue tail in ~9 words. Only a message the learner demonstrably worked through
 * turns its unlooked-up words into evidence of knowing them.
 */
export function createPlacementTracker(): PlacementTracker {
  const pendingByMessage = new Map<string, Map<string, number>>();

  const rememberExposure = (messageId: string, lemma: string, rank: number): void => {
    const pending = pendingByMessage.get(messageId) ?? new Map<string, number>();
    pending.set(lemma, rank);
    pendingByMessage.set(messageId, pending);
    for (const oldest of pendingByMessage.keys()) {
      if (pendingByMessage.size <= MAX_TRACKED_MESSAGES) break;
      pendingByMessage.delete(oldest);
    }
  };

  return {
    fold(state, signal, limits) {
      const { messageId, wordRank } = signal;
      if (messageId === null) return state;
      if (signal.kind === "exposure") {
        if (signal.firstEncounter && wordRank !== null) {
          rememberExposure(messageId, signal.lemma, wordRank);
        }
        return state;
      }
      if (!EXPLICIT_KINDS.has(signal.kind)) return state;
      let next = state;
      const pending = pendingByMessage.get(messageId);
      if (pending !== undefined) {
        pending.delete(signal.lemma);
        // Deterministic order: nearest rank first, so the stride compounds from the bottom.
        for (const [, rank] of [...pending].sort((a, b) => a[1] - b[1])) {
          next = updatePlacement(next, { kind: "clean-read", wordRank: rank }, limits);
        }
        pendingByMessage.delete(messageId);
      }
      if (!signal.firstEncounter || wordRank === null) return next;
      if (LOOKUP_KINDS.has(signal.kind)) {
        return updatePlacement(next, { kind: "lookup", wordRank }, limits);
      }
      if (signal.kind === "guess_abandoned") {
        return updatePlacement(next, { kind: "reset-step", wordRank }, limits);
      }
      return next;
    },
  };
}
