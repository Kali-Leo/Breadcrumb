/**
 * Purpose: the tests that decide whether a matched pair may be swapped into a learner's text.
 * Kept beside crossPack.mjs rather than inside it because these are the rules a reader comes
 * looking for — every one of them is a refusal, and each says why it exists.
 * Main exports: usableKey, isSentenceInitialVariant, weavable.
 */
import { HIGH_FREQUENCY_BAND } from "./crossPackLimits.mjs";

/** A key is evidence of meaning only while few enough words on either side claim it — and only
 * while it says something. English is the interlingua, so a key that is an English function
 * word ("the", "not", "him") bridges on grammar rather than on meaning: it matches every
 * language's articles and pronouns to each other, which is how `a → sebuah` and `him → beliau`
 * got woven. Grammar is not vocabulary, so those keys are dropped on both sides at once. */
export function usableKey(key, targetsByKey, sourceClaims) {
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
export function isSentenceInitialVariant(word, half) {
  const lowered = word.toLowerCase();
  if (lowered === word) return false;
  // Either the lower-case spelling is a word in its own right, or it is somebody's conjugation
  // that never earned an entry — German `hast` (you have) is only ever a form of `haben`, so it
  // is absent from `words` and present in `forms`, and `Hast` was being taught as 特急.
  return half.words[lowered] !== undefined || half.forms[lowered] !== undefined;
}

/** Everything that disqualifies a matched pair from being swapped into a learner's text. The
 * entry is still written; only `t1Safe` turns on it. */
export function weavable({ word, entry, chosen, targetEntry, bridgedOnPrimary, source, target }) {
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
