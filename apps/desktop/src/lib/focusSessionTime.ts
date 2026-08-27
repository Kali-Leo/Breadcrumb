/**
 * Purpose: pure relative-time label for a focus session row in the top-of-chat bar (Leo
 * 2026-08-14 revision to spec 042 §5) — "今天/昨天 HH:mm" for the last two local days,
 * otherwise a plain YYYY-MM-DD date.
 * Main exports: formatFocusSessionTimestamp.
 */
import i18next from "i18next";

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

/** `createdAtIso` relative to `now` (both read in local time). Today/yesterday collapse to a
 * short "今天/昨天 HH:mm" form; anything older falls back to a plain date. */
export function formatFocusSessionTimestamp(createdAtIso: string, now: Date = new Date()): string {
  const createdAt = new Date(createdAtIso);
  const time = `${twoDigits(createdAt.getHours())}:${twoDigits(createdAt.getMinutes())}`;
  if (sameLocalDay(createdAt, now)) return i18next.t("learning:focus.timeToday", { time });

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameLocalDay(createdAt, yesterday))
    return i18next.t("learning:focus.timeYesterday", { time });

  return `${createdAt.getFullYear()}-${twoDigits(createdAt.getMonth() + 1)}-${twoDigits(createdAt.getDate())}`;
}
