/**
 * Purpose: naming what the topic's material is *about*, in one or two words, so an elliptical
 * follow-up can be made searchable again.
 *
 * 「那它有多高？」 contains none of the words that would find its answer. Measured, dropping a
 * question's heaviest content word costs 53% of nDCG@10 and 51% of Recall@8, and no amount of
 * reranking gets it back — the right passages were never in the pool. Pasting the topic's one
 * or two heaviest entity words onto the front of the question recovers 92% of that
 * (2026-09-13-重排深度与追问改写-实测). The pasting itself is core-retrieval's
 * `prefixTopicEntities`; this file supplies the words.
 *
 * The score is deliberately not TF-IDF. Over one topic's own eight passages the subject is the
 * term that appears in *every* one of them, so an inverse-document-frequency weight would
 * score it zero and hand the topic's name to whatever noun happened to appear once. What
 * identifies a topic here is the opposite: the term the sources keep coming back to. So the
 * score is how many passages carry the term, broken in favour of the longer term — 「珠穆朗玛峰」
 * over 「高度」 — because a long token that recurs is a name and a short one is vocabulary.
 *
 * One filter is not optional. The segmenter falls back to character bigrams where its
 * dictionary has nothing to say, so an unsegmentable run yields fragments like 「的高」 that
 * recur in every passage and would otherwise be pasted onto the reader's question. A candidate
 * therefore has to be a word the segmenter itself recognises as one — a dictionary check, not
 * a hand-written stopword list, so it costs nothing to maintain and works the same in every
 * language the dictionary covers.
 * Main exports: TOPIC_ENTITY_MIN_CHARS, topicEntities.
 */
import { MAX_TOPIC_ENTITIES } from "@breadcrumb/core-retrieval";
import type { TopicPassage } from "./passages";
import { isWholeWord, tokenizeText } from "./tokens";

/** Shortest token that can name a topic: two characters is a word in CJK, four is a word
 * rather than a function word in an alphabetic script. */
export const TOPIC_ENTITY_MIN_CHARS = 2;
const ENTITY_MIN_LATIN_CHARS = 4;

function longEnough(token: string): boolean {
  return /^[a-z0-9]+$/.test(token)
    ? token.length >= ENTITY_MIN_LATIN_CHARS
    : token.length >= TOPIC_ENTITY_MIN_CHARS;
}

/** A token that is only a number is a figure, not a subject. */
function isNumeric(token: string): boolean {
  return /^\d+$/.test(token);
}

/**
 * The one or two words this topic's passages keep coming back to, best first. An empty list
 * when there is no material — a follow-up then goes to the index as the reader wrote it,
 * which is the honest degradation.
 */
export function topicEntities(
  passages: readonly TopicPassage[],
  limit: number = MAX_TOPIC_ENTITIES,
): string[] {
  const passageCount = new Map<string, number>();
  for (const passage of passages) {
    for (const token of tokenizeText(passage.text)) {
      if (!longEnough(token) || isNumeric(token) || !isWholeWord(token)) continue;
      passageCount.set(token, (passageCount.get(token) ?? 0) + 1);
    }
  }
  return [...passageCount.entries()]
    .sort(
      ([leftToken, leftCount], [rightToken, rightCount]) =>
        rightCount - leftCount ||
        rightToken.length - leftToken.length ||
        (leftToken < rightToken ? -1 : 1),
    )
    .slice(0, limit)
    .map(([token]) => token);
}
