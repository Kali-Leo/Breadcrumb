/**
 * Purpose: shared sentence-boundary lookup for hover/guess cards (diglot weave and explore
 * doors alike, spec 033 / spec 039) — guess cards always show real context, and for woven
 * text that context must be the WOVEN sentence: taken from the raw message it printed the
 * source word the learner is being asked to recall, i.e. the answer (audit 2026-08-28 #1).
 * Pure string arithmetic — no DOM, no rendering, no knowledge of either feature that calls
 * it — so it moved out of the desktop app into the text layer (2026-09-02).
 * Main exports: contextSentenceFor, wovenContextSentenceFor.
 */

/** A display-layer replacement, as far as context extraction is concerned. */
interface ContextPatch {
  start: number;
  end: number;
  replacement: string;
}

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

/**
 * The sentence around a span as the reader sees it on screen: every patch is applied, so the
 * source-language originals never appear. `span` is in ORIGINAL content coordinates (patches
 * carry the same coordinates); it is translated onto the woven string as the patches are
 * applied. Out-of-order or overlapping patches are skipped, matching the diff guard's rule
 * that only a well-formed patch set may alter the display.
 */
export function wovenContextSentenceFor(
  content: string,
  patches: readonly ContextPatch[],
  span: { start: number; end: number },
): string {
  const ordered = [...patches].sort((a, b) => a.start - b.start);
  let woven = "";
  let cursor = 0;
  let start = span.start;
  let end = span.end;
  for (const patch of ordered) {
    if (patch.start < cursor || patch.end <= patch.start || patch.end > content.length) continue;
    woven += content.slice(cursor, patch.start) + patch.replacement;
    cursor = patch.end;
    const delta = patch.replacement.length - (patch.end - patch.start);
    if (patch.end <= span.start) {
      start += delta;
      end += delta;
    } else if (patch.start < end) {
      end += delta;
    }
  }
  woven += content.slice(cursor);
  return contextSentenceFor(woven, { start, end: Math.max(start, end) });
}
