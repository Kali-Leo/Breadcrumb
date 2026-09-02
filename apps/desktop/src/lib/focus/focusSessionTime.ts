/**
 * Purpose: pure relative-time label for a focus session row in the top-of-chat bar (Leo
 * 2026-08-14 revision to spec 042 §5) — "今天/昨天 HH:mm" for the last two local days,
 * otherwise a plain YYYY-MM-DD date. Which day a moment belongs to is @breadcrumb/core-time's
 * call (2026-09-02), so this label and the palace layout's daily refresh cut the calendar at
 * the same instant.
 * Main exports: formatFocusSessionTimestamp.
 */
import { shiftLocalDays, toLocalDateKey } from "@breadcrumb/core-time";
import i18next from "i18next";

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

/** `createdAtIso` relative to `now` (both read in local time). Today/yesterday collapse to a
 * short "今天/昨天 HH:mm" form; anything older falls back to a plain date. */
export function formatFocusSessionTimestamp(createdAtIso: string, now: Date = new Date()): string {
  const createdAt = new Date(createdAtIso);
  const createdKey = toLocalDateKey(createdAt);
  const time = `${twoDigits(createdAt.getHours())}:${twoDigits(createdAt.getMinutes())}`;
  if (createdKey === toLocalDateKey(now)) return i18next.t("learning:focus.timeToday", { time });
  if (createdKey === toLocalDateKey(shiftLocalDays(now, -1)))
    return i18next.t("learning:focus.timeYesterday", { time });
  return createdKey;
}
