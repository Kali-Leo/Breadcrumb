/**
 * Purpose: pure reuse-vs-regenerate decision plus six-row board assembly for the ranked ladder
 * (spec 018) — evaluated only when the learner actively opens the ladder view, never on a
 * timer. No DB, no I/O, no LLM call here: the caller (desktop ladderStore) owns fetching the
 * stored ladder and, on "generate", calling the LLM contract in ladderPrompt.ts and the rank
 * anchors in rankEngine.ts.
 * Main exports: planLadderRefresh, LadderRefreshAction, StoredLadder, assembleLadderSlots,
 * LadderSlot.
 */
import { neighborRanks } from "./rankEngine";

export interface StoredLadder {
  /** The learner's own rank at the moment this generation was created — the anchor every
   * later "has the learner moved far enough to regenerate" check compares against. */
  userRankAtGeneration: number;
}

export type LadderRefreshAction = "reuse" | "generate";

/**
 * Decision rules (Leo, spec 018 #2), checked in order:
 * 1. No stored ladder -> generate.
 * 2. The learner's current rank has improved past (become smaller than) the SECOND
 *    above-neighbor's originally-anchored rank -> generate. Passing that far up the board
 *    means the anchored neighbors no longer make sense as "just above".
 * 3. The learner's current rank has fallen past (become larger than) the SECOND
 *    below-neighbor's originally-anchored rank -> generate, symmetric to #2.
 * 4. Otherwise -> reuse: the stored figures and their byte-stable rank anchors are kept; only
 *    the learner's own displayed slot among them moves. This is deliberately simple — no
 *    separate "equivalent progress delta" threshold, just "did the learner cross a real
 *    neighbor's anchor".
 */
export function planLadderRefresh(
  stored: StoredLadder | null,
  currentUserRank: number,
): LadderRefreshAction {
  if (stored === null) return "generate";

  const { above, below } = neighborRanks(stored.userRankAtGeneration);
  if (currentUserRank < (above[1] as number)) return "generate";
  if (currentUserRank > (below[1] as number)) return "generate";
  return "reuse";
}

export interface LadderSlot {
  rank: number;
  isUser: boolean;
}

/** Assembles the fixed six-row board (spec 018 #2): 3 above-neighbor ranks, the learner's own
 * rank, and 2 below-neighbor ranks, sorted ascending by rank (a SMALLER rank number is
 * better, so the best-ranked row is first). Since above ranks are always < userRank <
 * below ranks (rankEngine's neighborRanks contract), the learner's row lands at a constant
 * index 3 (the 4th row) whenever exactly 3 above and 2 below ranks are supplied. */
export function assembleLadderSlots(
  aboveRanks: readonly number[],
  userRank: number,
  belowRanks: readonly number[],
): LadderSlot[] {
  const slots: LadderSlot[] = [
    ...aboveRanks.map((rank) => ({ rank, isUser: false })),
    { rank: userRank, isUser: true },
    ...belowRanks.map((rank) => ({ rank, isUser: false })),
  ];
  return slots.sort((a, b) => a.rank - b.rank);
}
