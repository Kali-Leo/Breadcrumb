/**
 * Purpose: checks two and three — the pairing check and the existence check. Both are
 * string-level, deterministic and free; neither asks a model anything.
 *
 * **Pairing.** An alignment says "these two sentences are about the same thing". That is a
 * similarity claim, and similarity is exactly what a confident wrong number survives: 「珠峰高
 * 8844 米」 and 「珠峰高 8848.86 米」 are near-identical to any embedding. So a match only earns
 * the 有资料 label if the passage sentence actually carries the thing the answer sentence is
 * asserting — its figure when it states one, otherwise its subject entity.
 *
 * **Existence.** Whatever is quoted on screen has to be in the sources character for
 * character. That is the anchor gate's job and this reuses it rather than re-deriving it, so
 * a quote shown under a grounded sentence is held to the same rule as a judge's quote in the
 * fact-check path — including its one deliberate leniency, whitespace.
 * Main exports: ENTITY_MIN_CHARS, entityTokens, pairingHolds, quoteExistsIn.
 */

import type { EvidenceItem } from "../evidence/provider";
import { anchorKey, quoteIsGrounded } from "./anchorText";
import type { TopicPassage } from "./passages";
import { tokenizeText } from "./tokens";
import { specificValues, valueOccursIn } from "./values";

/**
 * Shortest token that can stand for the sentence's subject. Two characters is a word in CJK;
 * four is a word rather than a function word in an alphabetic script, and "the"/"und"/"pour"
 * appearing in a passage says nothing about whether it is the same subject.
 */
export const ENTITY_MIN_CHARS = 2;
const ENTITY_MIN_LATIN_CHARS = 4;

function isLatinToken(token: string): boolean {
  return /^[a-z0-9]+$/.test(token);
}

/** The sentence's candidate subject tokens, longest first: the longer a token is, the less
 * likely its presence in a passage is a coincidence. */
export function entityTokens(sentence: string, limit = 3): string[] {
  return [...tokenizeText(sentence)]
    .filter((token) =>
      isLatinToken(token)
        ? token.length >= ENTITY_MIN_LATIN_CHARS
        : token.length >= ENTITY_MIN_CHARS,
    )
    .sort((left, right) => right.length - left.length || (left < right ? -1 : 1))
    .slice(0, limit);
}

/**
 * Check two. True when the matched passage sentence really carries what the answer sentence
 * asserts: one of its figures if it states any, otherwise one of its subject tokens. A match
 * that fails this is not counted as 有资料 — the sentence keeps its own label instead of
 * borrowing a source's authority.
 */
export function pairingHolds(answerSentence: string, passageSentence: string): boolean {
  const values = specificValues(answerSentence);
  if (values.length > 0) {
    return values.some((value) => valueOccursIn(value, passageSentence));
  }
  const haystack = anchorKey(passageSentence).toLowerCase();
  return entityTokens(answerSentence).some((token) => haystack.includes(token));
}

/** Check three. True when the quote is in the passages verbatim (whitespace aside) — the
 * anchor gate's own comparison, over the topic's passages instead of a claim's evidence. */
export function quoteExistsIn(quote: string, passages: readonly TopicPassage[]): boolean {
  const asEvidence: EvidenceItem[] = passages.map((passage) => ({
    url: passage.url,
    title: passage.title,
    snippet: passage.text,
    source: passage.source,
  }));
  return quoteIsGrounded(quote, asEvidence);
}
