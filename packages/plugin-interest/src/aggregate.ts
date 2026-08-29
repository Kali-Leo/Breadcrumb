/**
 * Purpose: time-decayed, confidence-weighted shrinkage aggregation of raw interest_signals
 * rows into a per-node score plus evidence weight, and a global explanation-style ranking.
 * Two decay channels (short/long half-life) are aggregated independently and the per-dimension
 * max is reported: "recently on my mind OR persistently on my mind" both count (spec 059,
 * closing the 2026-08-28 audit's single-14-day-constant finding). Pure math, no DB, no I/O.
 * Main exports: aggregateInterest, aggregateStyles, NodeInterestScore,
 * INTEREST_SHORT_HALF_LIFE_DAYS, INTEREST_LONG_HALF_LIFE_DAYS, K_PSEUDO.
 */
import type { InterestSignalRow } from "@breadcrumb/core-db";

/** The short channel: what the learner has been into these couple of weeks.
 *
 * HONESTY NOTE (2026-08-28 audit): 14 days is a product intuition, not an empirical value.
 * Its only source is docs/vision/07 «两周前的兴趣只算一半», which cites nothing. Half-lives in
 * the literature are fitted per dataset, and a single user's signal is far too sparse to fit
 * one here — so this is not a number to defend, just one to state plainly. */
export const INTEREST_SHORT_HALF_LIFE_DAYS = 14;

/** The long channel: a course-sized interest should survive a quiet month. 90 days follows
 * the external interest daemon's 7/90 twin-track precedent and the long/short-term
 * disentangling line of recommender work the audit cites; like the 14 above it is a product
 * choice stated plainly, not a fitted value. */
export const INTEREST_LONG_HALF_LIFE_DAYS = 90;

/** Shrinkage pseudo-count (spec 014): a node's score is pulled toward a 0 prior until its
 * accumulated confidence×decay evidence weight outweighs this many "prior" pseudo-signals.
 * Two or three thin signals can't carry a high score; once real evidence piles up, the pull
 * fades on its own — no separate cutoff or "not enough data" branch needed. */
export const K_PSEUDO = 3;

export interface NodeInterestScore {
  nodeId: string;
  curiosity: number;
  confusion: number;
  boredom: number;
  /** Σ(confidence × long-channel decay) across every signal folded into this node's score —
   * the shrinkage aggregation's evidence mass, on the long channel because that is the
   * fuller memory of what was ever observed (long decay ≥ short decay for every signal).
   * Downstream callers (frontier, lab panel) use this to decide whether to flag a result as
   * "依据尚少" (evidence still thin). */
  evidenceWeight: number;
}

interface WeightedAccumulator {
  curiosity: number;
  confusion: number;
  boredom: number;
  weightTotal: number;
}

function emptyAccumulator(): WeightedAccumulator {
  return { curiosity: 0, confusion: 0, boredom: 0, weightTotal: 0 };
}

/** Per-channel shrinkage-weighted average of each dimension: score = Σ(value × confidence ×
 * decay) / (Σ(confidence × decay) + K_PSEUDO). A single strong-but-confident signal still
 * shrinks well below its raw value; the shrinkage vanishes as more corroborating evidence
 * accumulates. The node's reported score per dimension is max(short channel, long channel):
 * the short channel lets a recent burst stand out against an indifferent past, the long
 * channel keeps a months-old sustained interest from being read as gone. */
export function aggregateInterest(
  signals: readonly InterestSignalRow[],
  nowIso: string,
): Map<string, NodeInterestScore> {
  const now = Date.parse(nowIso);
  const shortByNode = new Map<string, WeightedAccumulator>();
  const longByNode = new Map<string, WeightedAccumulator>();

  for (const signal of signals) {
    const channels = [
      { accByNode: shortByNode, halfLifeDays: INTEREST_SHORT_HALF_LIFE_DAYS },
      { accByNode: longByNode, halfLifeDays: INTEREST_LONG_HALF_LIFE_DAYS },
    ];
    for (const { accByNode, halfLifeDays } of channels) {
      const weight = signal.confidence * decayWeight(now, signal.created_at, halfLifeDays);
      const acc = accByNode.get(signal.node_id) ?? emptyAccumulator();
      acc.curiosity += signal.curiosity * weight;
      acc.confusion += signal.confusion * weight;
      acc.boredom += signal.boredom * weight;
      acc.weightTotal += weight;
      accByNode.set(signal.node_id, acc);
    }
  }

  const scores = new Map<string, NodeInterestScore>();
  for (const [nodeId, longAcc] of longByNode) {
    const shortAcc = shortByNode.get(nodeId) ?? emptyAccumulator();
    const shrunk = (acc: WeightedAccumulator, dimension: keyof WeightedAccumulator) =>
      acc[dimension] / (acc.weightTotal + K_PSEUDO);
    scores.set(nodeId, {
      nodeId,
      curiosity: Math.max(shrunk(shortAcc, "curiosity"), shrunk(longAcc, "curiosity")),
      confusion: Math.max(shrunk(shortAcc, "confusion"), shrunk(longAcc, "confusion")),
      boredom: Math.max(shrunk(shortAcc, "boredom"), shrunk(longAcc, "boredom")),
      evidenceWeight: longAcc.weightTotal,
    });
  }
  return scores;
}

export interface StyleRanking {
  style: string;
  count: number;
}

/** Global explanation-style preference ranking, most-observed first. No time decay — this
 * is "what has worked for this learner", not a moving average. */
export function aggregateStyles(signals: readonly InterestSignalRow[]): StyleRanking[] {
  const countByStyle = new Map<string, number>();
  for (const signal of signals) {
    const styles = JSON.parse(signal.styles_json) as string[];
    for (const style of styles) {
      countByStyle.set(style, (countByStyle.get(style) ?? 0) + 1);
    }
  }
  return [...countByStyle.entries()]
    .map(([style, count]) => ({ style, count }))
    .sort((a, b) => b.count - a.count);
}

function decayWeight(nowMillis: number, createdAtIso: string, halfLifeDays: number): number {
  const ageDays = Math.max(0, (nowMillis - Date.parse(createdAtIso)) / (1000 * 60 * 60 * 24));
  return 0.5 ** (ageDays / halfLifeDays);
}
