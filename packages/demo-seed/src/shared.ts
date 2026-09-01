/**
 * Purpose: shared id/prefix and deterministic local-time helpers for the zero-LLM demo seed
 * (spec 035 T7b) — every row this seed writes is tagged so --wipe can find it precisely.
 * Main exports: Domain, DEMO_PAIR, demoId, isoAt.
 */

/** The two knowledge domains the demo landscape is built from. */
export type Domain = "astro" | "js";

/** The pair id demo word data lives under — deliberately NOT the real "zh:en" pair, so a
 * wipe (or a real pack install) never touches word progress the user actually made. Doubles
 * as the demo language pack's row id. */
export const DEMO_PAIR = "demo-zh-en";

/** Builds one `demo-` prefixed id — every seeded conversation/message/node/sighting/claim/
 * event/guess uses this, so `id LIKE 'demo-%'` finds (and a --wipe removes) all of them. */
export function demoId(kind: string, index: number | string): string {
  return `demo-${kind}-${index}`;
}

/** ISO instant `daysAgo` (>= 1) local days before `now`, at a fixed local hour/minute — any
 * instant on a strictly earlier calendar day is always before `now` regardless of hour, so
 * this is safe for every day but "today". Deterministic given a fixed `now`, and cut on LOCAL
 * calendar days so it lands correctly for the heatmap/daily-bite modules, which both bucket
 * by the machine's local timezone. */
export function isoAt(now: Date, daysAgo: number, hour: number, minute: number): string {
  const at = new Date(now);
  at.setDate(at.getDate() - daysAgo);
  at.setHours(hour, minute, 0, 0);
  return at.toISOString();
}

/** ISO instant `minutes` before `now` exactly — used for every "today" timestamp instead of a
 * fixed clock hour, since `now` is the real run instant and a hard-coded hour (e.g. "09:00")
 * could land in the future if the script runs earlier in the day. */
export function minutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60000).toISOString();
}

/** isoAt for daysAgo >= 1, minutesAgo(now, todayMinutesAgo) for daysAgo === 0 — a single
 * call sites can use regardless of whether a computed offset happens to land on "today". */
export function safeIsoAt(
  now: Date,
  daysAgo: number,
  hour: number,
  minute: number,
  todayMinutesAgo = 5,
): string {
  return daysAgo > 0 ? isoAt(now, daysAgo, hour, minute) : minutesAgo(now, todayMinutesAgo);
}
