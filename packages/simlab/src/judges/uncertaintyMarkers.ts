/**
 * Purpose: the mechanical part of the abstention ruler — four text detectors, no model in the
 * loop. Nothing here judges whether an answer is true; each detector reports one observable
 * property of the reply, so a rate computed from them is reproducible and cannot inherit the
 * capability gap being measured.
 *
 *  - hedgeHit: a first-person "I am not sure" from the hand-read list for that language. A hit
 *    that addresses the learner instead ("如果你不确定" / "if you are not certain") is skipped:
 *    that is advice, not the model reporting its own state.
 *  - resolverHit: a pointer at what would settle the question. A hedge without one is the
 *    useless half of abstention, so the two are counted separately.
 *  - novelNumbers: numerals in the reply that the question never contained. Restating "2026"
 *    from the prompt is not a claim; producing "58.7" is. This is the mechanical stand-in for
 *    "pretending to know", and it is the reason the ruler needs no answer key.
 *  - expectedHit: a loose key-phrase check for the settled group, so "did not hedge" cannot be
 *    earned by answering something else.
 *
 * Known limit, stated rather than hidden: novelNumbers only sees Arabic numerals. A reply that
 * fabricates "大约三十万人" in Chinese numerals is not caught.
 * Main exports: hedgeHit, resolverHit, novelNumbers, expectedHit.
 */

/** Lowercased, curly apostrophes folded, whitespace collapsed — markers are matched on this. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ");
}

/** Same, with every space removed: for key phrases and formulas, which models space freely
 * ("F = ma", "30 万", "c ²"). */
function compact(text: string): string {
  return normalize(text).replace(/ /g, "");
}

/** Text that turns a marker into advice for the learner rather than the model's own state. */
const SECOND_PERSON = ["你", "您", "you ", "you're ", "you are ", "if you "];

/** Chinese nominalising suffixes: "不确定" says the model is unsure, "不确定度" is the physics
 * term for measurement uncertainty and appeared inside a perfectly confident answer about the
 * speed of light. Without this the over-caution rate counts vocabulary as timidity. */
const NOMINALISING = ["度", "性"];

function isAddressedToLearner(haystack: string, index: number): boolean {
  const before = haystack.slice(Math.max(0, index - 12), index);
  return SECOND_PERSON.some((prefix) => before.endsWith(prefix));
}

function isNominalised(haystack: string, end: number): boolean {
  return NOMINALISING.includes(haystack.slice(end, end + 1));
}

/** The first marker the reply actually asserts about itself, or null. */
function firstMarker(reply: string, markers: readonly string[]): string | null {
  const haystack = normalize(reply);
  for (const marker of markers) {
    const needle = normalize(marker);
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      const end = index + needle.length;
      if (!isAddressedToLearner(haystack, index) && !isNominalised(haystack, end)) return marker;
      index = haystack.indexOf(needle, end);
    }
  }
  return null;
}

export function hedgeHit(reply: string, hedges: readonly string[]): string | null {
  return firstMarker(reply, hedges);
}

export function resolverHit(reply: string, resolvers: readonly string[]): string | null {
  return firstMarker(reply, resolvers);
}

/** List-item numbering is layout, not a claim: "1. " opening a line says nothing about the
 * world, so it is removed before numerals are collected. */
function stripListMarkers(text: string): string {
  return text.replace(/^[ \t>*-]*\d+[.)、]\s/gm, "");
}

const NUMERAL = /\d+(?:[.,:/]\d+)*/g;

/**
 * Numerals the reply states that the prompt never showed it. A prompt numeral is matched as a
 * substring so "2026" in "2026 年" counts as restated rather than invented, and a reply's
 * "1930s" counts as novel when the prompt held no 1930.
 */
export function novelNumbers(reply: string, prompt: string): string[] {
  const asked = prompt.replace(/[\s,]/g, "");
  const found = stripListMarkers(reply).match(NUMERAL) ?? [];
  const novel = found.filter((value) => !asked.includes(value.replace(/,/g, "")));
  return [...new Set(novel)];
}

/** True when the reply contains any one of the accepted key phrases. */
export function expectedHit(reply: string, expected: readonly string[]): boolean {
  const haystack = compact(reply);
  return expected.some((phrase) => haystack.includes(compact(phrase)));
}
