/**
 * Purpose: pure "milestone" scoring for a goal's progress readout (spec 016) — a single
 * 0..100 number summarizing progress toward one goal, plus its band word. No DB, no I/O;
 * goalMasteryByNode must be read under the SAME goal-local belief coverage() applies — a node
 * the learner declared done counts as lit for the goal — so the two numbers never silently
 * disagree. (Currently unconsumed by any UI; see the 2026-08-28 audit's planning gap 8.)
 * Main exports: milestone, milestoneBand, MilestoneBand, MILESTONE_BAND_THRESHOLDS,
 * MILESTONE_LIT_WEIGHT, MILESTONE_DIM_WEIGHT, MILESTONE_DIM_DISCOUNT.
 */

/** Weight of the lit fraction in the milestone formula — fully-mastered goal nodes count
 * for most of the number. */
export const MILESTONE_LIT_WEIGHT = 0.8;
/** Weight of the dim fraction, itself discounted by half again (a dim node is "half-lit",
 * not a full step) — 0.2 x 0.5 = 0.1 effective weight. */
export const MILESTONE_DIM_WEIGHT = 0.2;
export const MILESTONE_DIM_DISCOUNT = 0.5;

export type MilestoneBand = "起步" | "入门" | "扎实" | "纵深" | "贯通";

/** Inclusive lower bound of each band, in descending order — first match wins. */
export const MILESTONE_BAND_THRESHOLDS: readonly { min: number; band: MilestoneBand }[] = [
  { min: 80, band: "贯通" },
  { min: 60, band: "纵深" },
  { min: 40, band: "扎实" },
  { min: 20, band: "入门" },
  { min: 0, band: "起步" },
];

/** milestone(goal) = round(100 x (0.8 x litFraction + 0.2 x dimFraction x 0.5)) — a single
 * monotonic, non-committal-to-time progress number (spec 016 #2). Returns 0 for an empty
 * goalNodeIds set: a goal with nothing mapped to it has no meaningful progress to claim. */
export function milestone(
  goalNodeIds: readonly string[],
  goalMasteryByNode: ReadonlyMap<string, number>,
  litThreshold: number,
  dimThreshold: number,
): number {
  if (goalNodeIds.length === 0) return 0;

  let litCount = 0;
  let dimCount = 0;
  for (const nodeId of goalNodeIds) {
    const mastery = goalMasteryByNode.get(nodeId) ?? 0;
    if (mastery >= litThreshold) litCount += 1;
    else if (mastery >= dimThreshold) dimCount += 1;
  }

  const litFraction = litCount / goalNodeIds.length;
  const dimFraction = dimCount / goalNodeIds.length;
  const raw =
    100 *
    (MILESTONE_LIT_WEIGHT * litFraction +
      MILESTONE_DIM_WEIGHT * dimFraction * MILESTONE_DIM_DISCOUNT);
  return Math.round(raw);
}

/** Maps a 0..100 milestone number to its band word — no ranking percentile, no "beat N
 * people", just a qualitative sense of depth (spec 016 #2). */
export function milestoneBand(value: number): MilestoneBand {
  const match = MILESTONE_BAND_THRESHOLDS.find((entry) => value >= entry.min);
  return match?.band ?? "起步";
}
