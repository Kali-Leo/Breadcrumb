/**
 * Purpose: time-decayed aggregation of raw interest_signals rows into a per-node score and
 * a global explanation-style ranking. Pure math, no DB, no I/O.
 * Main exports: aggregateInterest, aggregateStyles, NodeInterestScore, INTEREST_HALF_LIFE_DAYS.
 */
import type { InterestSignalRow } from "@breadcrumb/core-db";

/** Older signals fade out of the aggregate on this half-life — recent psychology matters
 * more than what was true a month ago. */
export const INTEREST_HALF_LIFE_DAYS = 14;

export interface NodeInterestScore {
  nodeId: string;
  curiosity: number;
  confusion: number;
  boredom: number;
}

interface WeightedAccumulator {
  curiosity: number;
  confusion: number;
  boredom: number;
  weightTotal: number;
}

/** Exponentially time-decayed weighted average of each dimension, per node. */
export function aggregateInterest(
  signals: readonly InterestSignalRow[],
  nowIso: string,
): Map<string, NodeInterestScore> {
  const now = Date.parse(nowIso);
  const accByNode = new Map<string, WeightedAccumulator>();

  for (const signal of signals) {
    const weight = decayWeight(now, signal.created_at);
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
    scores.set(nodeId, {
      nodeId,
      curiosity: acc.weightTotal > 0 ? acc.curiosity / acc.weightTotal : 0,
      confusion: acc.weightTotal > 0 ? acc.confusion / acc.weightTotal : 0,
      boredom: acc.weightTotal > 0 ? acc.boredom / acc.weightTotal : 0,
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
