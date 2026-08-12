/**
 * Purpose: display-layer source normalization for chat markdown (spec 001 polish) —
 * converts LaTeX bracket delimiters (\[..\], \(..\)) that models like DeepSeek emit into
 * the dollar delimiters remark-math parses. Stored message content is never touched.
 * Main exports: normalizeMathDelimiters.
 */

/** Fenced/inline code spans must keep their backslashes untouched. */
const CODE_SPLIT_PATTERN = /(```[\s\S]*?```|`[^`\n]*`)/g;

function convertOutsideCode(segment: string): string {
  return segment
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body: string) => `\n$$\n${body.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, body: string) => `$${body.trim()}$`);
}

/** Rewrites \[..\] → $$..$$ (block) and \(..\) → $..$ (inline), skipping code spans.
 * The result is the canonical display source: markdown rendering AND diglot weaving both
 * run on it, so patch offsets always agree with what is on screen. */
export function normalizeMathDelimiters(content: string): string {
  return content
    .split(CODE_SPLIT_PATTERN)
    .map((segment, index) => (index % 2 === 1 ? segment : convertOutsideCode(segment)))
    .join("");
}
