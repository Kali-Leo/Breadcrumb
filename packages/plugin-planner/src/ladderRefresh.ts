/**
 * Purpose: pure reuse-vs-regenerate decision for the pseudo-ranked ladder (spec 016 #3) —
 * evaluated only when the learner actively opens the ladder view, never on a timer. No DB,
 * no I/O, no LLM call here: the caller (desktop ladderStore) owns fetching the stored ladder
 * and, on "generate", calling the LLM contract in ladderPrompt.ts.
 * Main exports: planLadderRefresh, LadderRefreshAction, StoredLadder, StoredLadderFigure,
 * LADDER_REGENERATE_DELTA.
 */

export interface StoredLadderFigure {
  figureDesc: string;
  milestone: number;
}

export interface StoredLadder {
  /** The learner's own milestone at the moment this generation was created — the anchor
   * every later "has the learner moved enough to regenerate" check compares against. */
  userMilestoneAtGeneration: number;
  figures: readonly StoredLadderFigure[];
}

export type LadderRefreshAction = "reuse" | "generate";

/** Minimum milestone movement (either direction) before a stored ladder gets regenerated. */
export const LADDER_REGENERATE_DELTA = 3;

/**
 * Decision rules (Leo, spec 016 #3), checked in order:
 * 1. No stored ladder -> generate.
 * 2. Current milestone has fallen more than LADDER_REGENERATE_DELTA below the lowest figure
 *    on the ladder -> generate (the learner has regressed out from under the whole ladder;
 *    forbidden list is still every shown description for the goal, same as any regeneration).
 * 3. Current milestone has risen by at least LADDER_REGENERATE_DELTA since generation ->
 *    generate (real progress earns a fresh ladder).
 * 4. Otherwise -> reuse: this covers both a small change in either direction (< delta) and a
 *    regression that hasn't fallen out from under the ladder — the stored figures and their
 *    byte-stable order are kept; only the learner's own displayed slot among them moves.
 */
export function planLadderRefresh(
  stored: StoredLadder | null,
  currentMilestone: number,
): LadderRefreshAction {
  if (stored === null) return "generate";

  const recordedMilestones = stored.figures.map((figure) => figure.milestone);
  const minRecordedMilestone = Math.min(...recordedMilestones);
  if (currentMilestone < minRecordedMilestone - LADDER_REGENERATE_DELTA) return "generate";

  if (currentMilestone >= stored.userMilestoneAtGeneration + LADDER_REGENERATE_DELTA) {
    return "generate";
  }

  return "reuse";
}
