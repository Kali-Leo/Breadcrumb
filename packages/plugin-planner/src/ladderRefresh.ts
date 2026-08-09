/**
 * Purpose: pure refresh-cadence decisions for the ladder's assessment cache (spec 022) — a
 * stored board lives until its randomized expiry passes, then the next view (or a quiet
 * background check) re-runs the assessment. This is cache pacing, NOT a ranking mechanism:
 * the ladder itself is only a display effect of the real-time assessment.
 * Main exports: isRefreshDue, nextRefreshAtIso, LADDER_REFRESH_MIN_HOURS,
 * LADDER_REFRESH_MAX_HOURS.
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

/** The next expiry moment, seeded on the caller's input (e.g. `${goalId}:${nowIso}`) so a
 * given regeneration always schedules the same stretch (deterministic, testable) while
 * consecutive regenerations vary. */
export function nextRefreshAtIso(nowIso: string, seedInput: string): string {
  const random = createSeededRandom(hashStringToSeed(`ladder-refresh:${seedInput}`));
  const hours =
    LADDER_REFRESH_MIN_HOURS + random() * (LADDER_REFRESH_MAX_HOURS - LADDER_REFRESH_MIN_HOURS);
  return new Date(Date.parse(nowIso) + Math.round(hours * 3_600_000)).toISOString();
}
