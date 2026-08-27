/**
 * Purpose: dates and numbers in the reader's own conventions. Everything goes through the
 * platform's Intl so no format is hand-written for one language and wrong in the next.
 * Main exports: formatDayMonth, formatDate, formatCount, formatPercent, fontStackFor.
 */
import { DEFAULT_LANGUAGE_CODE, type ScriptFamily } from "./languages";

/** A stored or test locale can be anything; a date that cannot be formatted must not take
 * the screen down with it, so an unusable tag falls back to the default language. */
function safeLocale(locale: string): string {
  try {
    new Intl.DateTimeFormat(locale);
    return locale;
  } catch {
    return DEFAULT_LANGUAGE_CODE;
  }
}

/** Short "August 27" / "8月27日" — used on chart axes and card metadata. */
export function formatDayMonth(locale: string, date: Date): string {
  return new Intl.DateTimeFormat(safeLocale(locale), { month: "short", day: "numeric" }).format(
    date,
  );
}

export function formatDate(locale: string, date: Date): string {
  return new Intl.DateTimeFormat(safeLocale(locale), { dateStyle: "medium" }).format(date);
}

export function formatCount(locale: string, value: number): string {
  return new Intl.NumberFormat(safeLocale(locale)).format(value);
}

export function formatPercent(locale: string, ratio: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(safeLocale(locale), {
    style: "percent",
    maximumFractionDigits: fractionDigits,
  }).format(ratio);
}

/**
 * Fonts per script, not per language: one stack has to serve every language written in that
 * script, and a machine in a place we have never heard of may have none of our first
 * choices — hence the generic family at the end of each stack.
 */
const FONT_STACKS: Record<ScriptFamily, string> = {
  latin: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  hanzi:
    'system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif',
  arabic: '"Noto Naskh Arabic", "Geeza Pro", "Segoe UI", Tahoma, system-ui, sans-serif',
  devanagari: '"Noto Sans Devanagari", "Nirmala UI", "Kohinoor Devanagari", system-ui, sans-serif',
  bengali: '"Noto Sans Bengali", "Nirmala UI", "Kohinoor Bangla", system-ui, sans-serif',
  ethiopic: '"Noto Sans Ethiopic", "Kefa", "Abyssinica SIL", system-ui, sans-serif',
  cyrillic: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

export function fontStackFor(script: ScriptFamily): string {
  return FONT_STACKS[script];
}
