/**
 * Purpose: how a source is named on screen. The providers identify themselves with a stable
 * ascii id ("wikipedia", "zhipu") because that id is stored with the quote and compared in
 * tests; a reader should never see it. This turns the id into the catalogue's own name for
 * that source, and leaves an unknown id as it stands rather than printing a missing key.
 *
 * The passage index that used to sit in front of the name ("[1] wikipedia ·") numbered
 * nothing the reader could look up — there is no numbered list anywhere on the page — so it
 * is not rendered at all. A quote from the reader's own library is the one case where the
 * name alone says nothing: 「我的资料」 could be any of their books, so the passage's heading
 * path ("书名 → 章 → 节") follows the name, and that is the same string the library's own
 * search page prints above a hit.
 * Main exports: groundingSourceLabel, groundingSourceHeading, joinLeadIn.
 */
import { LIBRARY_SOURCE } from "@breadcrumb/feature-factcheck";

/** i18next's own `t` narrowed to the one call shape used here. The key is built at runtime
 * from a provider id, which the generated key union cannot express, so it is widened at the
 * call site the same way the grounding marks already widen theirs. */
type Translate = (key: never) => string;

/** The reader-facing name of an evidence source, or the raw id when the catalogue has none. */
export function groundingSourceLabel(t: Translate, source: string): string {
  const key = `grounding.sources.${source}`;
  const label = t(key as never);
  return label === key || label.length === 0 ? source : label;
}

/** What names a quote on screen: the source's name, and for a library passage its heading
 * path as well. A library passage with no heading path (a document imported without any
 * headings) is named by the source alone rather than by a dangling separator. */
export function groundingSourceHeading(
  t: Translate,
  quote: { source: string; title: string },
): string {
  const label = groundingSourceLabel(t, quote.source);
  if (quote.source !== LIBRARY_SOURCE || quote.title.trim() === "") return label;
  return `${label} · ${quote.title.trim()}`;
}

/** Joins a catalogue lead-in ("另一来源：" / "Another source:") to the value that follows it.
 * Full-width punctuation already carries its own spacing; ascii punctuation does not. */
export function joinLeadIn(leadIn: string, value: string): string {
  return /[：（【]$/.test(leadIn) ? `${leadIn}${value}` : `${leadIn} ${value}`;
}
