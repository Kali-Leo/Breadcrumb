/**
 * Purpose: "which day is this" — decided once, for the whole product. Days are cut by the
 * machine's LOCAL timezone, never UTC, because every surface that shows a day shows it to
 * someone sitting in a timezone: the feedback heatmap's cells, the research lab's daily
 * correlation buckets, the trail's yesterday summary and the palace layout's once-a-day
 * refresh must all agree on where midnight falls, or the same study session lands on two
 * different days depending on which screen is looking at it.
 *
 * Extracted 2026-09-02 from three byte-identical private copies (feature-feedback,
 * feature-research, feature-trail) plus two near-copies in the desktop app, whose agreement
 * was maintained only by comments pointing at each other. This lives in core rather than in
 * one of them because feedback → research would be the wrong dependency edge.
 * Main exports: toLocalDateKey, dateKeyToLocalDate, shiftLocalDays, shiftDateKey,
 * dateKeyRange, startOfLocalDay, startOfLocalDayIso.
 */

/** An instant, however the caller happens to be holding it. */
export type Instant = Date | string;

function asDate(instant: Instant): Date {
  return instant instanceof Date ? instant : new Date(instant);
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local calendar date key, "YYYY-MM-DD", for an instant. */
export function toLocalDateKey(instant: Instant): string {
  const date = asDate(instant);
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

/** Local midnight opening the given date key. */
export function dateKeyToLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

/** Adds (or subtracts) whole local days to a Date, hopping DST correctly — setDate() moves
 * calendar days, which is not the same as adding 24 hours. */
export function shiftLocalDays(date: Date, deltaDays: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + deltaDays);
  return shifted;
}

/** Adds (or subtracts) whole days to a local date key. */
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  return toLocalDateKey(shiftLocalDays(dateKeyToLocalDate(dateKey), deltaDays));
}

/** Full local-day key sequence ending at `endInstant`'s day, oldest first, every day present:
 * (day - days + 1) … day inclusive. Gap-free by construction — the heatmap and the trend
 * series both need a complete range, zeros included. */
export function dateKeyRange(days: number, endInstant: Instant): string[] {
  const endKey = toLocalDateKey(endInstant);
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(shiftDateKey(endKey, -offset));
  }
  return keys;
}

/** Local midnight of the given moment. */
export function startOfLocalDay(instant: Instant = new Date()): Date {
  const dayStart = asDate(instant);
  const start = new Date(dayStart);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Local midnight of the given moment as the UTC ISO string database rows are stored in. */
export function startOfLocalDayIso(instant: Instant = new Date()): string {
  return startOfLocalDay(instant).toISOString();
}
