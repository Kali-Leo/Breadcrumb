/**
 * Purpose: deciding whether the round's question is still about the material already in the
 * prompt. Fetching sources costs seconds of the learner's time and a handful of external
 * requests, and a follow-up ("那测量误差有多大？") is answered from exactly the passages the
 * previous question fetched — so the retrieval runs on a topic change, not on every turn.
 *
 * The comparison is question-against-passages rather than question-against-question, because
 * the passages are what the answer will be grounded in: the question that would keep the same
 * eight passages is the question that does not need new ones, whatever it looks like next to
 * the previous question's wording.
 * Main exports: TOPIC_KEEP_THRESHOLD, bestTopicSimilarity, topicStillCovered.
 */
import { cosineSimilarity } from "@breadcrumb/core-vectors";

/**
 * Cosine, question against its best passage, at or above which the passages in hand are kept.
 *
 * The basis, and its limits: this product's e5-small vectors put genuinely related text pairs
 * in a 0.147-wide band (measured over real node pairs: min 0.802, median 0.854, max 0.949),
 * so a threshold has to sit inside that band to mean anything at all. 0.82 sits near its
 * floor, which biases the call toward re-fetching: a needless fetch costs a few seconds, while
 * keeping stale passages teaches the next question against the wrong material. Provisional —
 * it is a reasoned starting point, not a measured optimum, and it is a constant so that the
 * measurement, when it happens, changes one line.
 */
export const TOPIC_KEEP_THRESHOLD = 0.82;

/** The question's similarity to the closest passage it already has, or 0 when it has none. */
export function bestTopicSimilarity(
  questionVector: readonly number[] | null,
  passageVectors: readonly (readonly number[])[],
): number {
  if (questionVector === null || passageVectors.length === 0) return 0;
  return passageVectors.reduce(
    (best, vector) => Math.max(best, cosineSimilarity(questionVector, vector)),
    0,
  );
}

/**
 * True when this round can be taught against the passages already in hand. Without vectors
 * (no embedder on this machine yet, a failed load) the answer is false: re-fetching is the
 * degradation that still teaches against the right material.
 */
export function topicStillCovered(
  questionVector: readonly number[] | null,
  passageVectors: readonly (readonly number[])[],
  threshold: number = TOPIC_KEEP_THRESHOLD,
): boolean {
  return bestTopicSimilarity(questionVector, passageVectors) >= threshold;
}
