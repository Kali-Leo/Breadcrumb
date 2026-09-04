/**
 * Purpose: the English gloss keys that let two non-English languages be matched to each other.
 * Kaikki's extracts are all "a word of language X, glossed in English", so English is the only
 * thing a Spanish entry and a Turkish entry ever have in common. A key is that gloss reduced
 * to a comparable form: one sense, lowercased, no parenthetical asides, no leading article or
 * infinitive "to". Two words that produce the same key mean the same thing — as far as
 * Wiktionary's English wording can say so, which is why the pair builder also refuses keys
 * that too many words on either side claim.
 * Main exports: glossKeys, MAX_BRIDGE_CANDIDATES, MAX_SOURCE_SENSES.
 */
import { BLACKLIST_SUBSTRINGS } from "./entry-builder.mjs";

/** A key longer or wordier than this is a definition, not a translation, and matching on it
 * would be matching on Wiktionary's prose style rather than on meaning. */
const MAX_KEY_LENGTH = 40;
const MAX_KEY_WORDS = 4;

/**
 * How many words on one side may share a key before it stops being evidence of anything.
 * "line" glosses a dozen unrelated Spanish nouns; picking one of them for a learner would be
 * choosing a sense the sentence never chose. Four leaves room for ordinary synonymy (the pair
 * builder then takes the most frequent) and refuses the floods.
 */
export const MAX_BRIDGE_CANDIDATES = 4;

/** A word Wiktionary gives more senses than this is polysemous enough that its first gloss is
 * not reliably its dominant meaning, so it is kept for lookup but never woven. */
export const MAX_SOURCE_SENSES = 8;

const KEY_SHAPE = /^[a-z][a-z' -]*$/;

/**
 * The comparable senses of one raw gloss, in the order Wiktionary wrote them. Semicolons and
 * commas both separate synonyms in Wiktionary's house style ("to learn; to study", "big,
 * large"), so both split. Returns [] for a gloss that is a cross-reference or a label rather
 * than a meaning ("variant of X", "surname").
 */
export function glossKeys(rawGloss) {
  const lowered = rawGloss.toLowerCase();
  if (BLACKLIST_SUBSTRINGS.some((keyword) => lowered.includes(keyword))) return [];
  const stripped = lowered.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  const keys = [];
  for (const part of stripped.split(/[;,]/)) {
    const text = part
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^to\s+/, "")
      .replace(/^(a|an|the)\s+/, "")
      .replace(/[.!?]+$/, "")
      .trim();
    if (text.length === 0 || text.length > MAX_KEY_LENGTH) continue;
    if (!KEY_SHAPE.test(text)) continue;
    if (text.split(" ").length > MAX_KEY_WORDS) continue;
    keys.push(text);
  }
  return [...new Set(keys)];
}
