/**
 * Purpose: pure rank engine for the ranked ladder (spec 020, kept by spec 021) — the rank is a
 * PURE reward/incentive scalar driven by domain fuel: learning moves it forward, long
 * inactivity lets it slip back a bounded amount, and rank 1 is unreachable (someone is always
 * deeper in). Since spec 021 the scalar is internal-only: no number is ever shown, it exists
 * to feed the title ladder (ladderTitles.ts). No population, no percentage, no "completion"
 * semantics.
 * Main exports: goalDomainClosure, domainFuel, startRank, rankFromFuel, resolveShownRank,
 * ShownRankHistory, RANK_START_MIN, RANK_START_RANGE, RANK_FUEL_DECAY, RANK_SLIP_MAX_SHARE,
 * RANK_FLOOR.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import { prerequisiteClosure } from "@breadcrumb/plugin-graph";
import { createSeededRandom, hashStringToSeed } from "./seededRandom";

/** startRank draws from [RANK_START_MIN, RANK_START_MIN + RANK_START_RANGE] — a fresh goal
 * begins INSIDE the crowd (plenty of people know even less), never at a unique dead-last spot,
 * which would itself be a tell. */
export const RANK_START_MIN = 88_000;
export const RANK_START_RANGE = 88_000;
/** β in rank = 1 + round((start−1)·e^(−β·fuel)): each unit of fuel multiplies the remaining
 * distance to the top, so Δrank per unit shrinks as rank improves — advancing gets harder the
 * closer you are, with no unit of "percent complete" anywhere. */
export const RANK_FUEL_DECAY = 0.035;
/** Rank 1 is unclaimable in a knowledge domain (one can always go deeper), so the curve floors
 * at 2 — someone is永远 one step ahead. */
export const RANK_FLOOR = 2;
/** During a long no-learning stretch the shown rank may slip back, but by at most this share
 * of its previous value per view — "补回也要合理，不要补太多" (Leo). */
export const RANK_SLIP_MAX_SHARE = 0.1;

/**
 * A goal's "domain" for fuel purposes is its requires-closure recomputed fresh every call,
 * unioned with the goal's own node set. This is the binding interpretation of "同域后续新增
 * 节点": there is no stored domain snapshot — as new nodes/edges land in the same prerequisite
 * tree (via ordinary knowledge-tree growth), prerequisiteClosure() picks them up on its very
 * next call for free, so the domain organically grows over time without extra bookkeeping.
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

/** Seeded, deterministic starting rank for a goal — an organic-looking integer (never a round
 * multiple of 1000) that every rank computation for this goal descends from. */
export function startRank(goalId: string): number {
  const random = createSeededRandom(hashStringToSeed(`ladder-start:${goalId}`));
  let value = RANK_START_MIN + Math.floor(random() * (RANK_START_RANGE + 1));
  if (value % 1000 === 0) value += 7;
  return value;
}

/** The raw curve: monotone in fuel, deterministic, floored at RANK_FLOOR (never rank 1), and
 * never worse than the start. */
export function rankFromFuel(fuel: number, startRankValue: number): number {
  const raw = 1 + Math.round((startRankValue - 1) * Math.exp(-RANK_FUEL_DECAY * Math.max(0, fuel)));
  return Math.min(startRankValue, Math.max(RANK_FLOOR, raw));
}

export interface ShownRankHistory {
  /** The rank the learner actually saw last view. */
  lastShownRank: number;
  /** The domain fuel at that view — the reference for "has the learner learned since". */
  lastViewFuel: number;
}

/**
 * The rank to actually show (Leo, 08 §五): as long as the learner has learned anything since
 * the last view (fuel did not drop), the shown rank never worsens. When fuel HAS dropped
 * (mastery claims decay during a long absence), the rank may slip back — but by at most
 * RANK_SLIP_MAX_SHARE of its last shown value per view, and never past the goal's start rank.
 * With no history (first view), the raw curve value shows as-is.
 */
export function resolveShownRank(
  currentFuel: number,
  startRankValue: number,
  history: ShownRankHistory | null,
): number {
  const computed = rankFromFuel(currentFuel, startRankValue);
  if (history === null) return computed;
  if (currentFuel >= history.lastViewFuel) return Math.min(computed, history.lastShownRank);
  const worstAllowed = Math.min(
    startRankValue,
    Math.round(history.lastShownRank * (1 + RANK_SLIP_MAX_SHARE)),
  );
  return Math.min(computed, worstAllowed);
}
