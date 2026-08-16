/**
 * Purpose: reveal-time refine guard for the diglot weave (Leo 2026-08-16 weave-timing
 * ruling): the LLM refine is raced against a hard timeout so the streaming→message swap is
 * never held up; on timeout the base weave ships and refine is skipped for that message
 * forever (refine only ever runs at the reveal moment, so a timed-out message never retries).
 * Main exports: refineWithHardTimeout, REFINE_HARD_TIMEOUT_MS.
 */
import type { ReplacementPatch } from "@breadcrumb/plugin-diglot-weave";

export const REFINE_HARD_TIMEOUT_MS = 2000;

/** Races the refine call against the timeout. The base patches ship on timeout; a late
 * refine result is discarded (its metering row still records — the call did run). Refine
 * errors are already absorbed inside refineWeavePatches, so this never throws. */
export async function refineWithHardTimeout(
  refine: () => Promise<ReplacementPatch[]>,
  basePatches: ReplacementPatch[],
  timeoutMs: number,
): Promise<ReplacementPatch[]> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const refined = await Promise.race([refine(), timeout]);
  if (timer !== null) clearTimeout(timer);
  return refined ?? basePatches;
}
