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
  /**
   * bilibili play counts. Measured on 2026-08-18: the 知识 and 科技数码 daily rankings run from
   * a few hundred thousand to a couple of million, while 入站必刷 — the evergreen picks — runs
   * from 3 million to 128 million. Two million is where a daily ranking video is as popular as
   * that board gets; the evergreens all sit at 1, which is the honest answer for a list whose
   * entry requirement is being one of the site's hundred best videos ever.
   */
  bilibiliViews: 2_000_000,
  /** A day's page views on Chinese Wikipedia: the most-read list runs from a few thousand to a
   * few hundred thousand, and the top entry is usually whatever was in the news. */
  wikipediaDailyViews: 200_000,
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
