/**
 * Purpose: builds one language pair out of two interlingua halves, matching a source word to a
 * target word through the English gloss they share. This is what lets a Spanish reader learn
 * Turkish from data that only ever describes each language in English.
 *
 * The whole risk of the method is a bad match, so the rules are about refusing rather than
 * reaching, and they come in two kinds. Meaning: a gloss key too many words claim on either
 * side is thrown away, and only the source word's DOMINANT sense may be woven. Grammar
 * (wordShape.mjs, added after Leo's 2026-09-04 review): a word that is somebody else's
 * conjugation, a function word, a bare letter or an acronym is never woven, however well its
 * gloss matched — the first pass got mid-frequency words right and the top of the list badly
 * wrong, because the top of a frequency list is almost entirely grammar.
 *
 * Everything that fails these tests is kept for lookup with `t1Safe: false` — the pack is a
 * dictionary as well as a source of replacements.
 * Main exports: buildCrossPack.
 */
import { ENGLISH_FUNCTION_WORDS } from "./entry-builder.mjs";
import { MAX_BRIDGE_CANDIDATES, MAX_SOURCE_SENSES } from "./interlinguaGloss.mjs";
import { isContentPos, isFunctionPos, isLetterOrAcronym, shortPos } from "./wordShape.mjs";

const MAX_ALT_TARGETS = 6;
/**
 * How many inflected surfaces a pack may carry. The schema refuses a pack with more than
 * 200 000 (packSchema.ts), and an agglutinative source blows straight through that: Turkish
 * Wiktionary lists ~96 paradigm cells per lemma, so tr:en came out with 521 316 forms and
 * 14.7 MB — a pack the runtime would have refused to load, on a download ten times the size
 * of its neighbours. The cap is spent on the words a learner meets first: forms are taken in
 * the source language's own frequency order, so what falls off the end is the paradigm of a
 * rare word, not a random slice of every word's.
 */
const MAX_FORMS = 150_000;
/**
 * Where the extra-strict rule stops. Inside this band the source and target must be the same
 * part of speech and both must be content words; outside it, a shared dominant gloss is enough.
 *
 * 1000 because that is roughly where a frequency list stops being grammar and starts being
 * vocabulary: the top thousand of an OpenSubtitles list covers the large majority of running
 * text, so a wrong entry there is one the learner meets again and again rather than once, and
 * it is also where the pronouns, auxiliaries and irregular verb forms are concentrated. Below
 * it a wrong entry surfaces rarely and the recall of the looser rule is worth more.
 */
const HIGH_FREQUENCY_BAND = 1000;

/** key → the target words glossed with it, capped one past the ceiling so "too many" is still
 * distinguishable from "exactly the ceiling". */
function indexTargets(target) {
  const byKey = new Map();
  for (const word of Object.keys(target.words)) {
    for (const key of target.words[word].k) {
      let list = byKey.get(key);
      if (list === undefined) {
        list = [];
        byKey.set(key, list);
      }
      if (list.length <= MAX_BRIDGE_CANDIDATES) list.push(word);
    }
  }
  return byKey;
}

function countSourceClaims(source) {
  const counts = new Map();
  for (const word of Object.keys(source.words)) {
    for (const key of source.words[word].k) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * The candidate a learner is best served by: the word they will meet again soonest, and only
 * then a dictionary form over somebody's conjugation. Frequency has to come first. French
 * `porte` is the ordinary noun for "door" and also the imperative of `porter`; preferring the
 * dictionary form skipped it for `guichet` (a ticket window, rank 15 305) and wove that into
 * Spanish `puerta`. Ordering by frequency picks `porte`, whose inflected flag then refuses the
 * entry outright — not weaving `puerta` is the right answer, weaving `guichet` never was.
 * Ties break on length then alphabetically so a rebuild is byte-identical.
 */
function bestTarget(candidates, target) {
  let best = null;
  for (const word of candidates) {
    const entry = target.words[word];
    const here = { word, inflected: entry.x === 1, rank: entry.r ?? Number.POSITIVE_INFINITY };
    if (best === null || betterThan(here, best)) best = here;
  }
  return best === null ? null : best.word;
}

function betterThan(a, b) {
  if (a.rank !== b.rank) return a.rank < b.rank;
  if (a.inflected !== b.inflected) return b.inflected;
  if (a.word.length !== b.word.length) return a.word.length < b.word.length;
  return a.word < b.word;
}

/** A key is evidence of meaning only while few enough words on either side claim it — and only
 * while it says something. English is the interlingua, so a key that is an English function
 * word ("the", "not", "him") bridges on grammar rather than on meaning: it matches every
 * language's articles and pronouns to each other, which is how `a → sebuah` and `him → beliau`
 * got woven. Grammar is not vocabulary, so those keys are dropped on both sides at once. */
function usableKey(key, targetsByKey, sourceClaims) {
  if (ENGLISH_FUNCTION_WORDS.has(key)) return null;
  const candidates = targetsByKey.get(key);
  if (candidates === undefined || candidates.length > MAX_BRIDGE_CANDIDATES) return null;
  if ((sourceClaims.get(key) ?? 0) > MAX_BRIDGE_CANDIDATES) return null;
  return candidates;
}

/**
 * A capitalised spelling of a word that also exists in lower case is the same word at the start
 * of a sentence, not a different one. German makes this urgent because it capitalises its nouns,
 * so the frequency list is full of sentence-initial `Als`, `Hast`, `Denke` and `Alt` that
 * Wiktionary can also read as rare nouns — and de:ja wove `Als → 小川` (a stream) and
 * `vier → だれ` sat next to `Alt → アルト`. A genuine German noun like `Kind` or `Woche` has no
 * lower-case twin and is unaffected.
 */
function isSentenceInitialVariant(word, half) {
  const lowered = word.toLowerCase();
  if (lowered === word) return false;
  // Either the lower-case spelling is a word in its own right, or it is somebody's conjugation
  // that never earned an entry — German `hast` (you have) is only ever a form of `haben`, so it
  // is absent from `words` and present in `forms`, and `Hast` was being taught as 特急.
  return half.words[lowered] !== undefined || half.forms[lowered] !== undefined;
}

/** Everything that disqualifies a matched pair from being swapped into a learner's text. The
 * entry is still written; only `t1Safe` turns on it. */
function weavable({ word, entry, chosen, targetEntry, bridgedOnPrimary, source, target }) {
  if (!bridgedOnPrimary || entry.k.length > MAX_SOURCE_SENSES) return false;
  // Somebody else's conjugation, on either side. This is the rule that keeps `son` (they are)
  // away from `ton` (your) and `est` (is) away from `east`.
  if (entry.x === 1 || targetEntry.x === 1) return false;
  if (isFunctionPos(entry.p) || isFunctionPos(targetEntry.p)) return false;
  if (isLetterOrAcronym(word) || isLetterOrAcronym(chosen)) return false;
  if (isSentenceInitialVariant(word, source) || isSentenceInitialVariant(chosen, target)) {
    return false;
  }
  if (ENGLISH_FUNCTION_WORDS.has(chosen) || chosen.includes(" ")) return false;
  if (entry.r <= HIGH_FREQUENCY_BAND) {
    if (!isContentPos(entry.p) || !isContentPos(targetEntry.p)) return false;
    if (shortPos(entry.p) !== shortPos(targetEntry.p)) return false;
    // Gender is inflection for an adjective and a separate word for a noun, and up here the
    // adjective reading wins: Spanish `buena` is the feminine of `bueno` far more often than
    // it is the noun sense that had it glossed "inheritance".
    if (entry.g === 1 || targetEntry.g === 1) return false;
  }
  return true;
}

export function buildCrossPack({ source, target }) {
  const targetsByKey = indexTargets(target);
  const sourceClaims = countSourceClaims(source);
  const entries = Object.create(null); // keys are upstream text; see interlingua.mjs
  const forms = Object.create(null);
  const stats = { candidates: 0, kept: 0, t1Safe: 0, withReading: 0, formsOffered: 0 };

  for (const word of Object.keys(source.words)) {
    const entry = source.words[word];
    if (entry.r === null) continue; // no rank, no defensible introduction order
    stats.candidates += 1;

    let chosen = null;
    let bridgedOnPrimary = false;
    const altTargets = [];
    for (const key of entry.k) {
      const candidates = usableKey(key, targetsByKey, sourceClaims);
      if (candidates === null) continue;
      const pick = bestTarget(candidates, target);
      if (pick === null || pick === word) continue; // same spelling teaches nothing
      if (chosen === null) {
        chosen = pick;
        bridgedOnPrimary = key === entry.k[0];
      } else if (
        pick !== chosen &&
        !altTargets.includes(pick) &&
        altTargets.length < MAX_ALT_TARGETS
      ) {
        altTargets.push(pick);
      }
    }
    if (chosen === null) continue;

    const targetEntry = target.words[chosen];
    const t1Safe = weavable({ word, entry, chosen, targetEntry, bridgedOnPrimary, source, target });
    const reading = targetEntry.i ?? "";
    entries[word] = {
      target: chosen,
      pos: shortPos(entry.p) !== "" ? shortPos(entry.p) : shortPos(targetEntry.p),
      reading,
      altTargets,
      freqRank: entry.r,
      t1Safe,
    };
    stats.kept += 1;
    if (t1Safe) stats.t1Safe += 1;
    if (reading !== "") stats.withReading += 1;
  }

  const surfaces = Object.keys(source.forms)
    .filter((surface) => {
      const lemma = source.forms[surface];
      return entries[lemma] !== undefined && entries[surface] === undefined;
    })
    .sort((a, b) => entries[source.forms[a]].freqRank - entries[source.forms[b]].freqRank);
  stats.formsOffered = surfaces.length;
  for (const surface of surfaces.slice(0, MAX_FORMS)) forms[surface] = source.forms[surface];
  return { entries, forms, stats };
}
