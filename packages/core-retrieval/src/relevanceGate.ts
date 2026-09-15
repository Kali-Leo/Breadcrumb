/**
 * Purpose: whether a retrieved passage is about the question at all — the judgement a
 * ranking cannot make, with the lines drawn where the measurement drew them.
 *
 * A retrieval always returns its best eight. Against a library of one book, the best eight
 * for 「珠穆朗玛峰有多高」 are eight passages about compound interest, and before this gate
 * they filled the whole passage budget, so no encyclopaedia was ever asked and every
 * sentence of the answer was marked "not covered by sources". The gate turns "best" into
 * "good enough to show", per passage, and a question the library cannot answer comes back
 * empty — which is the signal the round needs to go to the network instead.
 *
 * The lines are measured, not guessed (docs/research/2026-09-15-资料相关度阈值与重排预算-实测.md).
 * Libraries of 2,500 passages were built from MIRACL zh, MIRACL en and DuReader — a few
 * books' worth, hard negatives included — and three groups of questions put to each through
 * exactly this pipeline: questions the library answers, questions from the same collection
 * it does not, and questions from a different collection altogether. Each line below is
 * where those groups separate, with what it lets through:
 *
 *  - reranker logit ≥ −1: 98–100% of answerable questions keep a passage, 92–95% of their
 *    relevant passages pass, 8–10% of foreign-collection questions get one passage through
 *    (out of eight slots — the rest go to the network), 18–40% of same-collection ones do,
 *    and on DuReader most of those turn out to be genuinely related pages the sparse labels
 *    missed.
 *  - cosine ≥ 0.72, when no reranker read the passage: 98–100% / 96–99% / 0–5% / 18–28%.
 *    Letting a keyword hit lower the line was measured and rejected: with an OR query on a
 *    library this size the keyword route matches most of the book, so the lower line only
 *    doubled the foreign pass rate and lifted nothing on the answerable side.
 *  - pool's best cosine < 0.65: not one of 120 answerable questions had its best passage
 *    this far away (5th percentile 0.76), while 80–85% of foreign-collection questions do,
 *    so the reranker's seconds are not spent on them.
 *  - term coverage ≥ 0.4, in the minute after an import when there are no vectors yet:
 *    83% / — / 9% / 34%. Coarse, because it is the only signal there is, and short-lived.
 * Main exports: isRelevant, worthReranking, keywordCoverage, PassageRelevance, RERANK_GATE,
 * COSINE_GATE, COSINE_RERANK_FLOOR, KEYWORD_COVERAGE_GATE.
 */

/** The evidence a passage was retrieved on. */
export interface PassageRelevance {
  /** Best cosine among the children that matched; null when the vector route had nothing. */
  cosine: number | null;
  /** Whether any child of this passage was in the keyword route's answer. */
  keywordHit: boolean;
  /** The cross-encoder's logit when this call reranked the passage; null otherwise. */
  rerank: number | null;
  /** Share of the question's terms found in the passage — computed only while there are no
   * vectors to ask, which is the first minute after an import. Null otherwise. */
  coverage: number | null;
}

/** Cross-encoder logit at or above which a passage is shown. */
export const RERANK_GATE = -1;

/** Cosine at or above which a passage is shown on the embedding alone. */
export const COSINE_GATE = 0.72;

/** Below this best cosine in the whole pool, nothing is close enough for the reranker to
 * rescue, and its seconds are not spent. */
export const COSINE_RERANK_FLOOR = 0.65;

/** Share of the question's terms a passage must contain to be shown on keywords alone. */
export const KEYWORD_COVERAGE_GATE = 0.4;

/** The share of `question` terms present in `passage` terms; 0 for an empty question. */
export function keywordCoverage(
  question: ReadonlySet<string>,
  passage: ReadonlySet<string>,
): number {
  if (question.size === 0) return 0;
  let found = 0;
  for (const term of question) if (passage.has(term)) found += 1;
  return found / question.size;
}

/**
 * `vectorsAnswered` says whether the vector route returned anything at all for this question.
 * When it did, a passage without a cosine is one that ranked below its hundredth — not
 * unknown, just far — and a keyword hit alone does not lift it. When it did not, there are
 * no vectors yet and the passage stands on how much of the question it actually contains.
 */
export function isRelevant(relevance: PassageRelevance, vectorsAnswered: boolean): boolean {
  if (relevance.rerank !== null) return relevance.rerank >= RERANK_GATE;
  if (relevance.cosine !== null) return relevance.cosine >= COSINE_GATE;
  if (vectorsAnswered) return false;
  if (relevance.coverage !== null) return relevance.coverage >= KEYWORD_COVERAGE_GATE;
  return relevance.keywordHit;
}

/** Whether a pool holds anything the reranker could find relevant. A pool with no cosine at
 * all (no vectors yet) is worth it: the keyword route alone is the weakest first stage. */
export function worthReranking(pool: readonly { relevance: PassageRelevance }[]): boolean {
  let sawCosine = false;
  for (const passage of pool) {
    const cosine = passage.relevance.cosine;
    if (cosine === null) continue;
    sawCosine = true;
    if (cosine >= COSINE_RERANK_FLOOR) return true;
  }
  return !sawCosine && pool.length > 0;
}
