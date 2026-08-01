/**
 * Purpose: a tripwire self-check of plugin-memory's remembered-behavior properties — spec
 * 013's "被记住" claim — re-encountering a node measurably raises its retention versus a
 * no-re-encounter control, and long idle measurably decays it. Pure, no DB; runs on every
 * metrics.json write as a regression guard on plugin-memory itself rather than a per-run
 * statistic (there's nothing journey-specific to measure — FSRS's math is the same regardless
 * of which journey produced the sightings).
 * Main exports: checkMasteryTripwires, MasteryTripwireResult.
 */
import { computeNodeRetention } from "@breadcrumb/plugin-memory";

export interface MasteryTripwireResult {
  reencounterBoostValid: boolean;
  idleDecayValid: boolean;
  detail: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const START = Date.parse("2026-01-01T00:00:00.000Z");

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function checkMasteryTripwires(): MasteryTripwireResult {
  const detail: string[] = [];
  const evaluationInstant = iso(START + 40 * DAY_MS);

  // Control: sighted once at day 0, never re-encountered, evaluated 40 days later.
  const controlRetention = computeNodeRetention([iso(START)], evaluationInstant);
  // Re-encountered: sighted again at day 20, evaluated at the same instant as the control.
  const reencounteredRetention = computeNodeRetention(
    [iso(START), iso(START + 20 * DAY_MS)],
    evaluationInstant,
  );
  const reencounterBoostValid = reencounteredRetention > controlRetention;
  if (!reencounterBoostValid) {
    detail.push(
      `re-encounter did not raise retention: control=${controlRetention}, reencountered=${reencounteredRetention}`,
    );
  }

  // Idle decay: retention right after sighting must exceed retention 40 days of silence later.
  const freshRetention = computeNodeRetention([iso(START)], iso(START + 1000));
  const idleDecayValid = freshRetention > controlRetention;
  if (!idleDecayValid) {
    detail.push(`idle decay did not occur: fresh=${freshRetention}, after40d=${controlRetention}`);
  }

  return { reencounterBoostValid, idleDecayValid, detail };
}
