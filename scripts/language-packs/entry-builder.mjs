/**
 * Purpose: ARPABET→IPA conversion, CEDICT gloss normalization, and the per-lemma merge/T1
 * whitelist logic (spec 033) that turns raw CEDICT lines into one language-pack entry.
 * Main exports: arpabetToIpa, normalizeGloss, buildEntryForLemma, BLACKLIST_SUBSTRINGS.
 */

/** Complete ARPABET (CMUdict phoneme set) → IPA table. Consonants have no stress digit;
 * vowels carry 0/1/2 — AH0 is the schwa exception, kept distinct from stressed AH. */
const ARPABET_TO_IPA = {
  AA: "ɑ",
  AE: "æ",
  AH: "ʌ",
  AO: "ɔ",
  AW: "aʊ",
  AY: "aɪ",
  B: "b",
  CH: "tʃ",
  D: "d",
  DH: "ð",
  EH: "ɛ",
  ER: "ɚ",
  EY: "eɪ",
  F: "f",
  G: "ɡ",
  HH: "h",
  IH: "ɪ",
  IY: "i",
  JH: "dʒ",
  K: "k",
  L: "l",
  M: "m",
  N: "n",
  NG: "ŋ",
  OW: "oʊ",
  OY: "ɔɪ",
  P: "p",
  R: "ɹ",
  S: "s",
  SH: "ʃ",
  T: "t",
  TH: "θ",
  UH: "ʊ",
  UW: "u",
  V: "v",
  W: "w",
  Y: "j",
  Z: "z",
  ZH: "ʒ",
};

/** Converts a CMUdict phoneme array to an IPA string. Primary stress (digit `1`) is rendered
 * as a `ˈ` prefix on that vowel; secondary/no stress (`2`/`0`) drop the marker — except AH0,
 * which maps to the schwa ə rather than ʌ. */
export function arpabetToIpa(phonemes) {
  let ipa = "";
  for (const phoneme of phonemes) {
    const match = /^([A-Z]+)([0-2])?$/.exec(phoneme);
    if (!match) continue;
    const [, base, stress] = match;
    const symbol = base === "AH" && stress === "0" ? "ə" : ARPABET_TO_IPA[base];
    if (symbol === undefined) continue;
    ipa += stress === "1" ? `ˈ${symbol}` : symbol;
  }
  return ipa;
}

/** English function words: semantically thin, hyper-frequent grammar carriers (pronouns,
 * articles, auxiliaries, prepositions, conjunctions, core quantifiers). Weaving these reads
 * terribly and teaches nearly nothing (Broccoli likewise excluded stopwords), so any entry
 * whose target lands here is t1Safe:false. Content conjunctions may return in a later pack. */
export const ENGLISH_FUNCTION_WORDS = new Set([
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
  "mine",
  "yours",
  "hers",
  "ours",
  "theirs",
  "myself",
  "yourself",
  "himself",
  "herself",
  "itself",
  "ourselves",
  "themselves",
  "this",
  "that",
  "these",
  "those",
  "what",
  "which",
  "who",
  "whom",
  "whose",
  "a",
  "an",
  "the",
  "be",
  "am",
  "is",
  "are",
  "was",
  "were",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "can",
  "could",
  "shall",
  "should",
  "may",
  "might",
  "must",
  "of",
  "in",
  "on",
  "at",
  "by",
  "for",
  "with",
  "from",
  "to",
  "into",
  "onto",
  "over",
  "under",
  "about",
  "between",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "up",
  "down",
  "out",
  "off",
  "again",
  "not",
  "no",
  "yes",
  "here",
  "there",
  "then",
  "than",
  "too",
  "very",
  "just",
  "also",
  "only",
  "such",
  "some",
  "any",
  "each",
  "every",
  "all",
  "both",
  "few",
  "more",
  "most",
  "other",
  "another",
  "same",
  "so",
  "now",
  "and",
  "or",
  "but",
  "because",
  "if",
  "while",
  "although",
  "though",
  "when",
  "where",
  "why",
  "how",
  "as",
  "until",
  "unless",
  "since",
  "nor",
  "either",
  "neither",
  "whether",
]);

/** Gloss substrings that mark a CEDICT sense as unreliable for deterministic replacement
 * (cross-reference notes, classifiers, surnames, archaic/dialectal usage, etc). */
export const BLACKLIST_SUBSTRINGS = [
  "variant of",
  "classifier for",
  "surname",
  "abbr.",
  "(archaic)",
  "used in",
  "see also",
  "old variant",
];

/** Normalizes one raw CEDICT gloss into a candidate target word: strips parenthetical
 * annotations, detects+strips a leading "to " (verb marker), strips a leading article, then
 * lowercases. `valid` is true only when the result matches ^[a-z][a-z'-]*$. */
export function normalizeGloss(rawGloss) {
  let text = rawGloss
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let pos = "n";
  if (/^to\s+/i.test(text)) {
    pos = "v";
    text = text.replace(/^to\s+/i, "");
  }
  text = text
    .replace(/^(a|an|the)\s+/i, "")
    .trim()
    .toLowerCase();
  const valid = /^[a-z][a-z'-]*$/.test(text);
  return { word: text, pos, valid };
}

/** Builds one pack entry for a simplified lemma from its (possibly several, one per
 * pronunciation) raw CEDICT lines. Applies the T1 whitelist rules from spec 033: proper nouns,
 * over-polysemous lines, blacklisted gloss language, single-character lemmas, conflicting
 * cross-line targets, and non-common-English targets all force `t1Safe: false` but keep the
 * entry — only a lemma with zero usable gloss anywhere is dropped (`entry: null`). */
export function buildEntryForLemma(simplified, lines, freqRank, cmuMap, englishFrequencySet) {
  const reasons = new Set();
  if (lines.some((line) => /[A-Z]/.test(line.pinyin))) reasons.add("properNoun");
  if (lines.some((line) => line.glosses.length > 2)) reasons.add("tooManyGlosses");
  const allGlossesLower = lines.flatMap((line) => line.glosses.map((g) => g.toLowerCase()));
  if (allGlossesLower.some((g) => BLACKLIST_SUBSTRINGS.some((kw) => g.includes(kw)))) {
    reasons.add("blacklistKeyword");
  }
  if ([...simplified].length === 1) reasons.add("singleChar");

  const [primary] = lines;
  const primaryTarget = normalizeGloss(primary.glosses[0]);

  const distinctValidTargets = new Set(
    lines
      .map((line) => normalizeGloss(line.glosses[0]))
      .filter((t) => t.valid)
      .map((t) => t.word),
  );
  if (distinctValidTargets.size > 1) reasons.add("conflictingLines");

  // Remaining glosses across every line (skipping the primary's own first gloss) become
  // altTarget candidates, deduplicated and capped at 6.
  const altCandidates = [];
  const seenWords = new Set([primaryTarget.word]);
  for (const line of lines) {
    const startIndex = line === primary ? 1 : 0;
    for (let i = startIndex; i < line.glosses.length && altCandidates.length < 6; i += 1) {
      const norm = normalizeGloss(line.glosses[i]);
      if (!norm.valid || seenWords.has(norm.word)) continue;
      seenWords.add(norm.word);
      altCandidates.push(norm);
    }
  }

  if (!primaryTarget.valid && altCandidates.length === 0) {
    return { entry: null, tradForms: [], reasons: new Set(["noValidTarget"]) };
  }

  // The primary gloss is the target unless it failed the single-word test, in which case the
  // first valid alt candidate is promoted to target instead.
  let target = primaryTarget;
  let altTargets = altCandidates.map((c) => c.word);
  if (!primaryTarget.valid) {
    reasons.add("targetRegexInvalid");
    target = altCandidates[0];
    altTargets = altCandidates.slice(1).map((c) => c.word);
  }

  if (!englishFrequencySet.has(target.word)) reasons.add("targetNotCommonEnglish");
  if (ENGLISH_FUNCTION_WORDS.has(target.word)) reasons.add("functionWordTarget");

  const phonemes = cmuMap.get(target.word);
  const reading = phonemes ? `/${arpabetToIpa(phonemes)}/` : "";

  const tradForms = [...new Set(lines.map((line) => line.traditional))].filter(
    (t) => t !== simplified,
  );

  return {
    entry: {
      target: target.word,
      pos: target.pos,
      reading,
      altTargets,
      freqRank,
      t1Safe: reasons.size === 0,
    },
    tradForms,
    reasons,
  };
}
