/**
 * Purpose: what a word IS, as opposed to what it means — the part of speech, whether it is a
 * dictionary form or somebody's conjugation, and whether it is really a word at all rather than
 * a letter or an acronym. The gloss bridge (interlinguaGloss.mjs) answers "do these two words
 * mean the same thing"; this answers "is this word one a learner can be shown in place of
 * another", and the two together decide `t1Safe`.
 *
 * This exists because matching on meaning alone put `son → ton` in the Spanish→French pack:
 * Spanish `son` really does have a noun sense meaning "sound", French `ton` really does mean
 * "tone", and in running text `son` is almost always "they are" (Leo's review, 2026-09-04).
 * Main exports: POS_TAGS, isFunctionPos, isContentPos, isLetterOrAcronym, shortPos.
 */

/** Kaikki part-of-speech names → the pack's coarse display tag. */
export const POS_TAGS = {
  noun: "n",
  verb: "v",
  adj: "adj",
  adv: "adv",
  name: "name",
  num: "num",
  pron: "pron",
  prep: "prep",
  conj: "conj",
  intj: "intj",
  det: "det",
  article: "det",
  particle: "part",
  postp: "prep",
  prep_phrase: "prep",
  suffix: "affix",
  prefix: "affix",
  infix: "affix",
  abbrev: "abbr",
  contraction: "contraction",
  punct: "punct",
  character: "char",
  symbol: "sym",
};

/**
 * Word classes that carry grammar rather than meaning. Swapping one of these teaches nothing —
 * the learner meets a foreign pronoun where their own stood and has no way to work out what it
 * was. Same judgement already applied to the English side of the bridge; this is the source and
 * target side of it.
 */
const FUNCTION_POS = new Set([
  "pron",
  "prep",
  "conj",
  "det",
  "article",
  "particle",
  "postp",
  "prep_phrase",
  "aux",
  "intj",
  "punct",
  "symbol",
  "character",
  "contraction",
  "abbrev",
  "prefix",
  "suffix",
  "infix",
]);

/** The classes a replacement may come from at all: things with a meaning to learn. */
const CONTENT_POS = new Set(["noun", "verb", "adj", "adv", "num"]);

export function isFunctionPos(pos) {
  return pos === "" || FUNCTION_POS.has(pos);
}

export function isContentPos(pos) {
  return CONTENT_POS.has(pos);
}

/**
 * A single letter, or an all-caps string that is an acronym rather than a word. Spanish `A`
 * has a Wiktionary noun sense ("bishop", from chess notation) and sits at frequency rank 4
 * because it is the preposition `a` capitalised at the start of a sentence; weaving it put a
 * French `fou` into the learner's text. Digits and punctuation go the same way.
 */
export function isLetterOrAcronym(word) {
  if ([...word].length <= 1) return true;
  if (/\d/.test(word)) return true;
  // A full stop inside a word means an abbreviation, not a word: `Sr.` was being taught as
  // French `sieur` at rank 157 of the es:fr pack.
  if (/[.]/.test(word)) return true;
  // Upper-case with no lower-case anywhere: an acronym in any bicameral script. Scripts with no
  // case at all (Chinese, Japanese, Arabic, Korean) are unaffected — they equal their own
  // upper-casing, so the second test keeps them out of this branch.
  return word === word.toUpperCase() && word !== word.toLowerCase();
}

/** The pack's display tag for a raw Kaikki part of speech. */
export function shortPos(pos) {
  return POS_TAGS[pos] ?? "";
}
