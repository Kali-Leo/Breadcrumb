/**
 * Purpose: how a source is named on screen. The providers identify themselves with a stable
 * ascii id ("wikipedia", "zhipu") because that id is stored with the quote and compared in
 * tests; a reader should never see it. This turns the id into the catalogue's own name for
 * that source, and leaves an unknown id as it stands rather than printing a missing key.
 *
 * The passage index that used to sit in front of the name ("[1] wikipedia ·") numbered
 * nothing the reader could look up — there is no numbered list anywhere on the page — so it
 * is not rendered at all.
 * Main exports: groundingSourceLabel, joinLeadIn.
 */

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

/** Joins a catalogue lead-in ("另一来源：" / "Another source:") to the value that follows it.
 * Full-width punctuation already carries its own spacing; ascii punctuation does not. */
export function joinLeadIn(leadIn: string, value: string): string {
  return /[：（【]$/.test(leadIn) ? `${leadIn}${value}` : `${leadIn} ${value}`;
}
