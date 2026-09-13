/**
 * Purpose: the third label — 资料相悖. Not "the answer disagrees with a source" (the fact-check
 * path already reports that), but "the sources disagree with each other about this sentence",
 * which is the case where the honest thing on screen is both readings side by side rather
 * than a verdict.
 *
 * Mechanical and narrow on purpose. Two passages from **different providers** count as
 * disagreeing only when they state different figures **in the same unit** about the sentence
 * in hand: 8848.86 米 against 8844.43 米 is a disagreement, 8848.86 米 against 29,031.7 英尺 is
 * the same fact in another unit, and a bare "1953" against "1954" with no unit at all is more
 * often two different events than two accounts of one. Nothing here reads meaning; where a
 * disagreement is not visible as arithmetic, the sentence keeps whatever label it had.
 * Main exports: SourceConflict, findConflict.
 */

import type { PassageSentence } from "./align";
import { anchorKey } from "./anchorText";
import { entityTokens } from "./checks";
import { type SpecificValue, specificValues } from "./values";

/** Same figure, thousands separators aside. Compared for equality rather than containment:
 * "884" is a substring of "8848" and is not the same measurement. */
function sameNumber(left: SpecificValue, right: SpecificValue): boolean {
  return left.number.replace(/,/g, "") === right.number.replace(/,/g, "");
}

export interface SourceConflict {
  /** The passage sentence the answer aligned to. */
  agreeing: PassageSentence;
  /** A sentence from another source giving a different figure in the same unit. */
  disagreeing: PassageSentence;
}

/** True when the passage sentence is talking about the same thing as the answer sentence —
 * one shared subject token. Without this, any two numbers with the same unit anywhere in the
 * topic's eight passages would read as a contradiction. */
function sharesSubject(answerSentence: string, candidate: PassageSentence): boolean {
  const haystack = anchorKey(candidate.text).toLowerCase();
  return entityTokens(answerSentence).some((token) => haystack.includes(token));
}

/**
 * The first disagreement between the matched source and another source about this sentence's
 * figures, or null. `matched` is the sentence the answer aligned to; `candidates` is every
 * other source sentence in the topic.
 */
export function findConflict(
  answerSentence: string,
  matched: PassageSentence,
  candidates: readonly PassageSentence[],
): SourceConflict | null {
  const values = specificValues(answerSentence).filter((value) => value.unit !== "");
  if (values.length === 0) return null;
  for (const candidate of candidates) {
    if (candidate.source === matched.source || candidate.text === matched.text) continue;
    if (!sharesSubject(answerSentence, candidate)) continue;
    const rival = specificValues(candidate.text).filter((value) => value.unit !== "");
    const disagrees = values.some((value) =>
      rival.some((other) => other.unit === value.unit && !sameNumber(value, other)),
    );
    if (disagrees) return { agreeing: matched, disagreeing: candidate };
  }
  return null;
}
