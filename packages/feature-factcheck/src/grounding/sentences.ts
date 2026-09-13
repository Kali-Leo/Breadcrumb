/**
 * Purpose: cutting an answer (and a source passage) into the units everything downstream is
 * decided at, and saying where each one sits in the original string.
 *
 * The offsets are the load-bearing part. A label is worth something only where the reader is
 * already looking — in the answer itself — so the renderer has to be able to put a mark at the
 * end of the sentence it belongs to. That is why the markdown is *masked* rather than
 * stripped: every character the reader never sees is replaced by a space instead of being
 * deleted, so the masked string is the same length as the original and every index in one is
 * the same index in the other. Deleting the markup was the earlier, simpler choice and it made
 * the sentences unplaceable.
 *
 * What is masked is markup, not language: fenced and inline code, headings, block quotes, list
 * markers, table rows, and the punctuation of emphasis and links — the link's own text stays
 * where it was. A code block cut on its full stops would otherwise be aligned against an
 * encyclopaedia paragraph and labelled for no reason.
 * Main exports: SENTENCE_MIN_CHARS, SentenceSpan, maskMarkdown, splitSentences.
 */

/** Below this many non-whitespace characters a sentence has nothing to align. */
export const SENTENCE_MIN_CHARS = 6;

export interface SentenceSpan {
  /** The sentence as the reader sees it: markup masked away, ends trimmed. */
  text: string;
  /** Index of its first character in the string passed to splitSentences. */
  start: number;
  /** Index just past its last non-whitespace character — where a mark belongs. */
  end: number;
}

const FENCED_CODE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const INLINE_CODE = /`[^`\n]*`/g;
const IMAGE_OR_LINK = /!?\[([^\]\n]*)\]\([^)\n]*\)/g;
const HEADING_OR_QUOTE = /^[ \t]*(?:#{1,6}|>)[ \t]*/gm;
const LIST_MARKER = /^[ \t]*(?:[-*+]|\d+[.)、])[ \t]+/gm;
const TABLE_ROW = /^[ \t]*\|.*\|[ \t]*$/gm;
const EMPHASIS = /(\*\*|__|\*|_)(?=\S)([\s\S]*?\S)\1/g;

/** Same length as its input, with newlines preserved so line-anchored patterns still see
 * lines: a run of markup becomes a run of spaces. */
function blank(text: string): string {
  return text.replace(/[^\n]/g, " ");
}

/** The prose a reader sees, with every markup character replaced by a space so that indexes
 * into the result are indexes into the original. */
export function maskMarkdown(text: string): string {
  return text
    .replace(FENCED_CODE, blank)
    .replace(TABLE_ROW, blank)
    .replace(INLINE_CODE, blank)
    .replace(
      IMAGE_OR_LINK,
      (match, label: string) => ` ${label}${blank(match.slice(label.length + 1))}`,
    )
    .replace(HEADING_OR_QUOTE, blank)
    .replace(LIST_MARKER, blank)
    .replace(
      EMPHASIS,
      (_match, fence: string, body: string) => `${blank(fence)}${body}${blank(fence)}`,
    );
}

/** Sentence-ending punctuation across the scripts the product ships in, plus the newline —
 * a bullet that never ends in a full stop is still one sentence. */
const BOUNDARY = /^(?:[。！？!?；;\n]|\.(?=\s|$)|۔|।|፡)/;

/**
 * The sentences of `text`, in order, each trimmed, long enough to be worth checking, and
 * carrying the offsets it occupies in `text` itself.
 */
export function splitSentences(text: string): SentenceSpan[] {
  const masked = maskMarkdown(text);
  const spans: SentenceSpan[] = [];
  let cut = 0;
  for (let index = 0; index <= masked.length; index += 1) {
    const atEnd = index === masked.length;
    if (!atEnd && !BOUNDARY.test(masked.slice(index, index + 2))) continue;
    const span = trimmedSpan(masked, cut, atEnd ? index : index + 1);
    if (span !== null) spans.push(span);
    cut = atEnd ? index : index + 1;
  }
  return spans;
}

/** The span with its surrounding whitespace removed, or null when nothing checkable is left. */
function trimmedSpan(masked: string, from: number, to: number): SentenceSpan | null {
  let start = from;
  let end = to;
  while (start < end && /\s/.test(masked[start] ?? "")) start += 1;
  while (end > start && /\s/.test(masked[end - 1] ?? "")) end -= 1;
  const text = masked.slice(start, end);
  if (text.replace(/\s/g, "").length < SENTENCE_MIN_CHARS) return null;
  return { text, start, end };
}
