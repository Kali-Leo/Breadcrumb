/**
 * Purpose: local-day bucketing shared by the feedback lab's trend series (spec 035 T7a) —
 * turns a day count plus "now" into the local calendar date sequence each series samples.
 * The sequence itself is @breadcrumb/core-time's (2026-09-02 — this package had written the
 * same loop twice, once here and once in activity.ts); only the end-of-day sampling instant,
 * which is this module's own idea, stays local.
 * Main exports: dateKeyRange, localDayEndIso.
 */
import { dateKeyToLocalDate } from "@breadcrumb/core-time";

export { dateKeyRange } from "@breadcrumb/core-time";

/** The last instant of a local calendar day, as an ISO string — the sampling point each
 * series uses so "today's value" reflects everything that happened today. */
export function localDayEndIso(dateKey: string): string {
  const dayEnd = dateKeyToLocalDate(dateKey);
  dayEnd.setHours(23, 59, 59, 999);
  return dayEnd.toISOString();
}
