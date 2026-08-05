/**
 * Purpose: pure refresh-cadence decisions and six-row board assembly for the ranked ladder
 * (spec 020) — a board lives until its randomized expiry passes, then the next view (or a
 * quiet background check) regenerates the whole neighbor cast. No reuse rules, no anchor
 * bookkeeping, no history: leaderboards simply change over time (Leo, 08 §五).
 * Main exports: isRefreshDue, nextRefreshAtIso, assembleLadderSlots, LadderSlot,
 * LADDER_REFRESH_MIN_HOURS, LADDER_REFRESH_MAX_HOURS.
 */
import { createSeededRandom, hashStringToSeed } from "./seededRandom";

/** A regenerated board schedules its own expiry a uniform-random stretch ahead — sometimes
 * under a day, sometimes almost three ("间隔时间有长有短，在一个范围内随机"). */
export const LADDER_REFRESH_MIN_HOURS = 20;
export const LADDER_REFRESH_MAX_HOURS = 68;

/** True when there is no schedule yet (fresh goal) or the scheduled moment has passed. ISO
 * strings compare correctly lexicographically only for identical formats, so compare epochs. */
export function isRefreshDue(nextRefreshAtIso: string | null, nowIso: string): boolean {
  if (nextRefreshAtIso === null) return true;
  return Date.parse(nowIso) >= Date.parse(nextRefreshAtIso);
}

/** The next expiry moment, seeded per `${goalId}:${generation}` so a given regeneration always
 * schedules the same stretch (deterministic, testable) while consecutive generations vary. */
export function nextRefreshAtIso(nowIso: string, seedInput: string): string {
  const random = createSeededRandom(hashStringToSeed(`ladder-refresh:${seedInput}`));
  const hours =
    LADDER_REFRESH_MIN_HOURS + random() * (LADDER_REFRESH_MAX_HOURS - LADDER_REFRESH_MIN_HOURS);
  return new Date(Date.parse(nowIso) + Math.round(hours * 3_600_000)).toISOString();
}

export interface LadderSlot {
  rank: number;
  isUser: boolean;
}

/** Assembles the six-row board: above-neighbor ranks, the learner's own rank, below-neighbor
 * ranks, sorted ascending (a SMALLER rank number is better, so the best row is first). With
 * rankEngine's tight 3-above/2-below neighbors the learner sits on the 4th row at generation
 * time; between refreshes their own row may drift as their rank moves — that is the
 * leaderboard living, resolved by the next regeneration. */
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
