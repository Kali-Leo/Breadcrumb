/**
 * Purpose: the one truncation rule the desktop UI uses wherever a label is longer than the
 * place it is drawn in — the same four lines had been copied into five files. Cutting happens
 * on Unicode code points, never UTF-16 code units, so an emoji or an extension-plane CJK
 * character is not split into two halves that render as tofu. Callers keep their own
 * character budget: how much fits belongs to the place the text is drawn, not to the rule.
 * Main exports: truncate.
 */

/** `text` cut to `maxChars` code points with an ellipsis appended; text that already fits is
 * returned untouched (so a cut result is maxChars + 1 characters long). */
export function truncate(text: string, maxChars: number): string {
  const chars = Array.from(text);
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join("")}…` : text;
}
