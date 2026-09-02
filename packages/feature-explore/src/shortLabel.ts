/**
 * Purpose: shortens a focus station's label so the subway map's truncated text stays
 * readable. This used to be an LLM call per long label; it is arithmetic on the label's own
 * text, which costs nothing, cannot fail, and cannot hallucinate a name for a station.
 *
 * Shortening is only ever cosmetic — the raw label is what the station is really called, and
 * every caller falls back to it. So the rules are conservative: strip the parts of a label
 * that are decoration, and if what is left still does not fit, keep the raw label rather than
 * cutting a word in half.
 *
 * Main exports: shortenStationLabel, RAW_LABEL_SHORT_ENOUGH, SHORT_LABEL_MAX.
 */

/** Labels this short already fit the map; nothing to do. Counted in code points so CJK and
 * latin are measured the same way. */
export const RAW_LABEL_SHORT_ENOUGH = 10;

/** What the map can show without truncating. */
export const SHORT_LABEL_MAX = 6;

/** Trailing parentheticals, quotes and bracket pairs: decoration around the actual term. */
const DECORATION = [
  /[（(][^）)]*[）)]\s*$/u,
  /[【[][^】\]]*[】\]]\s*$/u,
  /^[「"'“‘]+|[」"'”’]+$/gu,
];

/** Words that qualify a term rather than name it — dropping them keeps the noun. */
const QUALIFIER_PREFIXES = ["关于", "什么是", "如何", "怎么", "为什么"];

/** Separators a label can be cut at without splitting a word. */
const SEGMENT_SEPARATORS = /[·:：,，、;；—\-/|]/u;

function codePointLength(text: string): number {
  return [...text].length;
}

/**
 * A short display name for a long label, or null when the raw label should be kept as-is —
 * either because it already fits, or because nothing could be trimmed without mangling it.
 */
export function shortenStationLabel(rawLabel: string): string | null {
  const raw = rawLabel.trim();
  if (raw.length === 0) return null;
  if (codePointLength(raw) <= RAW_LABEL_SHORT_ENOUGH) return null;

  let text = raw;
  for (const pattern of DECORATION) text = text.replace(pattern, "").trim();
  for (const prefix of QUALIFIER_PREFIXES) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }
  if (codePointLength(text) <= SHORT_LABEL_MAX) {
    return text.length > 0 && text !== raw ? text : null;
  }

  // Take the first segment when the label is a compound: "闭包 · 作用域链" -> "闭包".
  const [firstSegment] = text.split(SEGMENT_SEPARATORS);
  const candidate = firstSegment?.trim() ?? "";
  if (candidate.length > 0 && codePointLength(candidate) <= SHORT_LABEL_MAX) {
    return candidate;
  }

  // Nothing fits without cutting into a word. The map truncates the raw label with an
  // ellipsis, which reads better than a word chopped at an arbitrary character.
  return null;
}
