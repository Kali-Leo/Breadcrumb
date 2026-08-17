/**
 * Purpose: turn a raw crowd number — Discourse replies, V2EX replies, Hacker News points — into
 * the 0..1 `upstreamSignal` the candidate contract carries. These counts are heavy-tailed: one
 * front-page story can hold forty times the points of an ordinary one, so a linear scale would
 * flatten everything below the top item to zero. A logarithmic curve keeps ordinary items apart.
 * Main exports: normalizeCountToSignal, saturationCounts.
 */

/**
 * The count at which a channel is treated as "as popular as it gets" — the point where the signal
 * reaches 1. Set from the shape of each board rather than from a measured maximum, because the
 * maximum moves and one viral thread must not push every other thread to zero.
 */
export const saturationCounts = {
  /** Discourse forum replies: linux.do threads past a couple hundred replies are megathreads. */
  discourseReplies: 200,
  /** V2EX replies: the hot list tops out in the low hundreds. */
  v2exReplies: 200,
  /** Hacker News points: the front page runs from a few dozen to a few hundred. */
  hackerNewsPoints: 500,
} as const;

/**
 * Maps a count to 0..1 on a log curve: 0 for nothing, 1 at the saturation count, and roughly the
 * halfway mark an order of magnitude below it. Non-numbers and negatives read as no signal at all
 * rather than throwing — these numbers arrive from the network.
 */
export function normalizeCountToSignal(count: number, saturationCount: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (!Number.isFinite(saturationCount) || saturationCount <= 1) return 1;
  const normalized = Math.log1p(count) / Math.log1p(saturationCount);
  return Math.min(1, Math.max(0, normalized));
}
