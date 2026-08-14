/**
 * Purpose: shared sentence-boundary lookup for hover/guess cards (diglot weave and explore
 * doors alike, spec 033 / spec 039) — guess cards always show real context.
 * Main exports: contextSentenceFor.
 */

/** The sentence around a span — walks outward from [start, end) to the nearest sentence
 * boundary punctuation (or the string edges). */
export function contextSentenceFor(content: string, span: { start: number; end: number }): string {
  const boundary = /[。!?.!?\n]/;
  let start = span.start;
  while (start > 0 && !boundary.test(content[start - 1] ?? "")) start -= 1;
  let end = span.end;
  while (end < content.length && !boundary.test(content[end] ?? "")) end += 1;
  return content.slice(start, Math.min(end + 1, content.length)).trim();
}
