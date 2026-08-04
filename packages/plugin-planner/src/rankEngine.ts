/**
 * Purpose: pure "名次" (rank) engine for the ranked-ladder view (spec 018) — fuel accumulated
 * over a goal's ever-growing prerequisite closure maps through a soft-asymptotic progress
 * curve into a log-scale rank number with no ceiling, so goal completion never ends the climb.
 * Main exports: goalDomainClosure, domainFuel, progressFromFuel, rankFromProgress,
 * progressFromRank, neighborRanks, NeighborRanks, RANK_R0, RANK_BETA,
 * RANK_PROGRESS_F0_MIN, RANK_PROGRESS_F0_FACTOR, RANK_ABOVE_RATIOS, RANK_BELOW_RATIOS.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import { prerequisiteClosure } from "@breadcrumb/plugin-graph";

/** Best possible rank number the curve can express (rank 1 is the top). */
export const RANK_R0 = 100_000;
/** Decay rate of the rank curve, chosen so m=100 maps to rank 1 and m=0 maps to rank R0. */
export const RANK_BETA = Math.log(RANK_R0) / 100;
/** Floor on the softening constant F0, so a goal with a tiny (or empty) closure still has a
 * sane, non-zero denominator. */
export const RANK_PROGRESS_F0_MIN = 3;
/** F0 scales with closure size — a bigger domain takes proportionally more fuel to feel "lit". */
export const RANK_PROGRESS_F0_FACTOR = 0.6;
/** Above-neighbor rank ratios (spec 018 #2) — each multiplies the user's rank by a factor
 * below 1, since a smaller rank number is a BETTER position. Ascending ratio order also
 * happens to be ascending rank order (furthest-above first, closest-to-user last). */
export const RANK_ABOVE_RATIOS = [0.55, 0.72, 0.9] as const;
/** Below-neighbor rank ratios — each multiplies the user's rank by a factor above 1, a WORSE
 * (larger) rank number. Ascending ratio order is ascending rank order (closest first). */
export const RANK_BELOW_RATIOS = [1.15, 1.4] as const;

/**
 * A goal's "domain" for fuel purposes (spec 018 #1) is its requires-closure recomputed fresh
 * every call, unioned with the goal's own node set. This is the binding interpretation of
 * "同域后续新增节点" for v1: there is no stored domain snapshot — as new nodes/edges land in
 * the same prerequisite tree (via ordinary knowledge-tree growth), prerequisiteClosure() picks
 * them up on its very next call for free, so the domain organically grows over time without
 * any extra bookkeeping here.
 */
export function goalDomainClosure(
  edges: readonly KnowledgeEdgeRow[],
  goalNodeIds: readonly string[],
): string[] {
  const closure = prerequisiteClosure(edges, goalNodeIds);
  return [...new Set([...closure, ...goalNodeIds])];
}

/** fuel = Σ mastery over the domain closure — review/consolidation and same-domain expansion
 * both raise it, with no upper bound and no notion of "done". 0 for an empty closure. */
export function domainFuel(
  closureNodeIds: readonly string[],
  goalMasteryByNode: ReadonlyMap<string, number>,
): number {
  let fuel = 0;
  for (const nodeId of closureNodeIds) {
    fuel += goalMasteryByNode.get(nodeId) ?? 0;
  }
  return fuel;
}

/** m = 100 x (1 - e^(-fuel/F0)), F0 = max(3, 0.6 x closureSize) — a soft asymptote that keeps
 * climbing (ever more slowly) past full closure coverage, never reaching exactly 100. */
export function progressFromFuel(fuel: number, closureSize: number): number {
  const f0 = Math.max(RANK_PROGRESS_F0_MIN, RANK_PROGRESS_F0_FACTOR * closureSize);
  return 100 * (1 - Math.exp(-fuel / f0));
}

/** rank = ceil(R0 x e^(-beta*m)), clamped to a minimum of 1 — same m always yields the same
 * rank (deterministic, no hidden randomness that could "break the illusion"). */
export function rankFromProgress(m: number): number {
  return Math.max(1, Math.ceil(RANK_R0 * Math.exp(-RANK_BETA * m)));
}

/** Inverse of the rank curve (ignoring the integer ceil): the progress value m whose exact
 * rank would be this number. Used to derive "fraction of fuel to the next rank" for the UI
 * progress bar, and any other place that needs to reason about a rank in progress terms. */
export function progressFromRank(rank: number): number {
  const clampedRank = Math.max(1, rank);
  return (100 * Math.log(RANK_R0 / clampedRank)) / Math.log(RANK_R0);
}

export interface NeighborRanks {
  /** 3 ranks better (smaller) than userRank, ascending — furthest-above first. */
  above: readonly [number, number, number];
  /** 2 ranks worse (larger) than userRank, ascending — closest-to-user first. */
  below: readonly [number, number];
}

/** Ratio-anchored neighbor ranks around the user's current rank (spec 018 #2) — computed once
 * at generation time and then fixed, so the neighbors' rank identity survives the user's own
 * rank moving around them until the next regeneration. Each is ceil'd, clamped to >=1, and
 * pushed apart from its neighbors so all 5 (plus the user's own) are distinct; above ranks are
 * additionally kept strictly below userRank and below ranks strictly above it, except in the
 * unreachable edge case userRank<=1 (rank 1 requires the curve's exact asymptote, m=100, which
 * finite fuel never reaches) where an above rank may floor out at 1 alongside the user. */
export function neighborRanks(userRank: number): NeighborRanks {
  const rawAbove = RANK_ABOVE_RATIOS.map((ratio) => Math.max(1, Math.ceil(userRank * ratio)));
  const above: number[] = new Array(rawAbove.length);
  let aboveCap = userRank - 1;
  for (let i = rawAbove.length - 1; i >= 0; i--) {
    const candidate = Math.max(1, Math.min(rawAbove[i] as number, aboveCap));
    above[i] = candidate;
    aboveCap = candidate - 1;
  }

  const rawBelow = RANK_BELOW_RATIOS.map((ratio) => Math.max(1, Math.ceil(userRank * ratio)));
  const below: number[] = new Array(rawBelow.length);
  let belowFloor = userRank + 1;
  for (let i = 0; i < rawBelow.length; i++) {
    const candidate = Math.max(rawBelow[i] as number, belowFloor);
    below[i] = candidate;
    belowFloor = candidate + 1;
  }

  return {
    above: above as [number, number, number],
    below: below as [number, number],
  };
}
