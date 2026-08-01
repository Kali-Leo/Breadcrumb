/**
 * Purpose: tripwires computed over one journey's own DayDigest sequence — digest
 * reconciliation (nodeCount delta must equal newNodeLabelsToday.length per day, so S5's
 * method-node undercount or any future miscount is caught) and frontier staleness (nodes
 * grew across a day boundary but frontierTop5 stayed byte-identical — visibility into P1's
 * known "frontier goes stale" design gap, WARN-level, not a hard failure). Pure functions
 * over already-computed DayDigest[] — no I/O, no DB.
 * Main exports: checkDigestReconciliation, checkFrontierStaleness, FrontierStalenessResult.
 */
import type { DayDigest } from "../runner/dayDigest";
import type { Violation } from "./invariants";

/** Independently re-derives each day's node-count delta from newNodeLabelsToday and compares
 * it to the digest's own nodeCount — day 0 compares against an empty starting tree (every
 * journey runs in a fresh temp database). */
export function checkDigestReconciliation(dayDigests: readonly DayDigest[]): Violation[] {
  const violations: Violation[] = [];
  let previousNodeCount = 0;
  for (const digest of dayDigests) {
    const delta = digest.nodeCount - previousNodeCount;
    if (delta !== digest.newNodeLabelsToday.length) {
      violations.push({
        kind: "digest-reconciliation-mismatch",
        detail: `day ${digest.day}: nodeCount delta ${delta} != newNodeLabelsToday.length ${digest.newNodeLabelsToday.length}`,
      });
    }
    previousNodeCount = digest.nodeCount;
  }
  return violations;
}

export interface FrontierStalenessResult {
  /** Longest run of consecutive day-boundaries where nodes grew but frontierTop5 stayed
   * byte-identical to the previous day. >=2 is the WARN threshold this metric is built to
   * surface — a single stale day is normal (interest/mastery can genuinely not move the
   * frontier), a run of 2+ is the pattern the first sim hunt flagged (P1). */
  maxStaleStreak: number;
  /** Total number of individual stale boundaries, not just the longest run. */
  staleBoundaryCount: number;
}

export function checkFrontierStaleness(dayDigests: readonly DayDigest[]): FrontierStalenessResult {
  let maxStaleStreak = 0;
  let currentStreak = 0;
  let staleBoundaryCount = 0;

  for (let index = 1; index < dayDigests.length; index += 1) {
    const previous = dayDigests[index - 1];
    const current = dayDigests[index];
    if (previous === undefined || current === undefined) continue;
    const nodesGrew = current.nodeCount > previous.nodeCount;
    const frontierUnchanged =
      JSON.stringify(current.frontierTop5) === JSON.stringify(previous.frontierTop5);

    if (nodesGrew && frontierUnchanged) {
      currentStreak += 1;
      staleBoundaryCount += 1;
      maxStaleStreak = Math.max(maxStaleStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return { maxStaleStreak, staleBoundaryCount };
}
