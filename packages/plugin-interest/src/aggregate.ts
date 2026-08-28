/**
 * Purpose: time-decayed, confidence-weighted shrinkage aggregation of raw interest_signals
 * rows into a per-node score plus evidence weight, and a global explanation-style ranking.
 * Pure math, no DB, no I/O.
 * Main exports: aggregateInterest, aggregateStyles, NodeInterestScore, INTEREST_HALF_LIFE_DAYS,
 * K_PSEUDO.
 */
import type { InterestSignalRow } from "@breadcrumb/core-db";

/** Older signals fade out of the aggregate on this half-life — recent psychology matters
 * more than what was true a month ago.
 *
 * HONESTY NOTE (2026-08-28 audit): 14 days is a product intuition, not an empirical value.
 * Its only source is docs/vision/07 «两周前的兴趣只算一半», which cites nothing. Half-lives in
 * the literature are fitted per dataset (one recommender paper fits ~150 days on movie
 * ratings), and a single user's signal is far too sparse to fit one here — so this is not a
 * number to defend, just one to state plainly. Splitting it into a short/long pair is a
 * separate open design item, deliberately not done in this pass. */
export const INTEREST_HALF_LIFE_DAYS = 14;

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
  /** Σ(confidence × decay) across every signal folded into this node's score — the
   * shrinkage aggregation's evidence mass. Downstream callers (frontier, lab panel) use this
   * to decide whether to flag a result as "依据尚少" (evidence still thin). */
  evidenceWeight: number;
}

interface WeightedAccumulator {
  curiosity: number;
  confusion: number;
  boredom: number;
  weightTotal: number;
}

/** Shrinkage-weighted average of each dimension, per node: score = Σ(value × confidence ×
 * decay) / (Σ(confidence × decay) + K_PSEUDO). A single strong-but-confident signal still
 * shrinks well below its raw value; the shrinkage vanishes as more corroborating evidence
 * accumulates. */
export function aggregateInterest(
  signals: readonly InterestSignalRow[],
  nowIso: string,
): Map<string, NodeInterestScore> {
  const now = Date.parse(nowIso);
  const accByNode = new Map<string, WeightedAccumulator>();

  for (const signal of signals) {
    const weight = signal.confidence * decayWeight(now, signal.created_at);
    const acc = accByNode.get(signal.node_id) ?? {
      curiosity: 0,
      confusion: 0,
      boredom: 0,
      weightTotal: 0,
    };
    acc.curiosity += signal.curiosity * weight;
    acc.confusion += signal.confusion * weight;
    acc.boredom += signal.boredom * weight;
    acc.weightTotal += weight;
    accByNode.set(signal.node_id, acc);
  }

  const scores = new Map<string, NodeInterestScore>();
  for (const [nodeId, acc] of accByNode) {
    const denominator = acc.weightTotal + K_PSEUDO;
    scores.set(nodeId, {
      nodeId,
      curiosity: acc.curiosity / denominator,
      confusion: acc.confusion / denominator,
      boredom: acc.boredom / denominator,
      evidenceWeight: acc.weightTotal,
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

function decayWeight(nowMillis: number, createdAtIso: string): number {
  const ageDays = Math.max(0, (nowMillis - Date.parse(createdAtIso)) / (1000 * 60 * 60 * 24));
  return 0.5 ** (ageDays / INTEREST_HALF_LIFE_DAYS);
}
