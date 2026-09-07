/**
 * Purpose: builds one language pair out of two interlingua halves, matching a source word to a
 * target word through the English gloss they share. This is what lets a Spanish reader learn
 * Turkish from data that only ever describes each language in English.
 *
 * The whole risk of the method is a bad match, so the rules are about refusing rather than
 * reaching, and they come in two kinds. Meaning: a gloss key too many words claim on either
 * side is thrown away, and only the source word's DOMINANT sense may be woven. Grammar
 * (wordShape.mjs): a word that is somebody else's conjugation, a function word, a bare letter
 * or an acronym is never woven, however well its gloss matched — mid-frequency words are easy
 * to get right this way, but the top of a frequency list is almost entirely grammar, so it goes
 * badly wrong there without this check.
 *
 * Everything that fails these tests is kept for lookup with `t1Safe: false` — the pack is a
 * dictionary as well as a source of replacements.
 * Main exports: buildCrossPack.
 */
import { HIGH_FREQUENCY_BAND } from "./crossPackLimits.mjs";
import { isSentenceInitialVariant, usableKey, weavable } from "./crossPackRules.mjs";
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
