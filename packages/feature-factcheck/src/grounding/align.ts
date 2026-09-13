/**
 * Purpose: aligning an answer back onto its sources after the fact — the code writes the
 * citations, the model does not.
 *
 * That split is the whole point. In this repo's own runs a small model asked to write `[3]`
 * after a sentence put the right number there 13% of the time; the same sentences aligned by
 * this layer landed on the right passage 62% of the time. A wrong number under a correct
 * sentence is worse than no number, and it costs prompt budget and instruction-following to
 * obtain — so the prompt never mentions numbering and this file recovers it instead.
 *
 * Three gates, any one of which is enough, because they fail differently:
 *  - **vector**, which sees a paraphrase that shares no words;
 *  - **token overlap**, which sees a near-verbatim restatement even when the local embedding
 *    model is unavailable or is having a bad day on a low-resource script;
 *  - **a shared measurement**, which sees the case the other two are worst at and the one
 *    this feature exists for: a sentence built around 8848.86 米 and the source sentence that
 *    states it are the same claim however differently the rest of the two read. Only decimals
 *    count — a year or a count is not distinctive enough to identify a sentence by, and
 *    admitting 2020 would marry unrelated sentences that merely happened in the same year.
 * Embeddings are passed in rather than computed here: the model lives in the app (Rust on the
 * desktop, a worker in the browser), and a headless package must not know which.
 * Main exports: ALIGN_VECTOR_THRESHOLD, ALIGN_OVERLAP_THRESHOLD, ALIGN_MIN_TOKENS,
 * PassageSentence, SentenceMatch, sharesMeasurement, passageSentences, alignSentences.
 */
import { cosineSimilarity } from "@breadcrumb/core-vectors";
import type { TopicPassage } from "./passages";
import { splitSentences } from "./sentences";
import { overlapCoefficient, tokenizeText } from "./tokens";
import { specificValues, valueOccursIn } from "./values";

/**
 * Cosine above which a reply sentence and a source sentence are treated as the same claim.
 * The product's e5-small vectors pack genuinely related pairs into a narrow high band
 * (measured: min 0.802, median 0.854, max 0.949 over real node pairs), so the gate sits just
 * under that band's median: high enough that unrelated prose does not clear it, low enough
 * that a real paraphrase is not thrown away. It is a starting value, not a measured optimum —
 * re-measure it against the alignment gold set before treating it as settled.
 */
export const ALIGN_VECTOR_THRESHOLD = 0.82;

/** Share of the shorter sentence's tokens above which it counts as a literal restatement of a
 * source sentence, no vectors involved. Deliberately strict: this gate exists to catch
 * copying, and the vector gate above already covers rewording. */
export const ALIGN_OVERLAP_THRESHOLD = 0.7;

/** Below this many tokens, an answer sentence is short enough that its whole vocabulary turns
 * up inside some passage by chance — 「一次讲一步。」 is contained in a great deal of prose. Such
 * a sentence can still align through the vector gate, where length is not a free pass. */
export const ALIGN_MIN_TOKENS = 3;

export interface PassageSentence {
  /** 1-based passage number, as shown to the reader. */
  passageIndex: number;
  source: string;
  /** Verbatim from the passage — this is what gets quoted on screen. */
  text: string;
}

export interface SentenceMatch {
  sentence: PassageSentence;
  vectorScore: number;
  literalScore: number;
  /** True when both sentences state the same decimal measurement. */
  measurementMatch: boolean;
}

/**
 * True when the two sentences state the same decimal figure. Decimals only: 8848.86 picks out
 * one claim in a corpus, while 2020 picks out a year that a hundred unrelated sentences share.
 */
export function sharesMeasurement(answer: string, source: string): boolean {
  return specificValues(answer)
    .filter((value) => /[.]/.test(value.number))
    .some((value) => valueOccursIn(value, source));
}

/** Every passage cut into sentences, in passage order. */
export function passageSentences(passages: readonly TopicPassage[]): PassageSentence[] {
  return passages.flatMap((passage) =>
    splitSentences(passage.text).map((sentence) => ({
      passageIndex: passage.index,
      source: passage.source,
      text: sentence.text,
    })),
  );
}

/** Cosine of two rows of a vector list, or 0 when either row is missing (no embeddings, a
 * short batch): the literal gate then decides alone rather than a missing vector scoring high. */
function vectorScore(
  left: readonly number[] | undefined,
  right: readonly number[] | undefined,
): number {
  if (left === undefined || right === undefined) return 0;
  return cosineSimilarity(left, right);
}

/**
 * The best source sentence for each answer sentence, or null where nothing cleared either
 * gate. `answerVectors` and `sourceVectors` are row-aligned with their sentence lists; pass
 * null for both when the embedder is unavailable and the literal gate carries the whole job.
 */
export function alignSentences(input: {
  answerSentences: readonly string[];
  sourceSentences: readonly PassageSentence[];
  answerVectors: readonly (readonly number[])[] | null;
  sourceVectors: readonly (readonly number[])[] | null;
}): (SentenceMatch | null)[] {
  const sourceTokens = input.sourceSentences.map((sentence) => tokenizeText(sentence.text));
  return input.answerSentences.map((answer, answerIndex) => {
    const answerTokens = tokenizeText(answer);
    let best: SentenceMatch | null = null;
    for (const [sourceIndex, sentence] of input.sourceSentences.entries()) {
      const vector = vectorScore(
        input.answerVectors?.[answerIndex],
        input.sourceVectors?.[sourceIndex],
      );
      const literal =
        answerTokens.size < ALIGN_MIN_TOKENS
          ? 0
          : overlapCoefficient(answerTokens, sourceTokens[sourceIndex] ?? new Set());
      const measurement = sharesMeasurement(answer, sentence.text);
      if (!measurement && vector < ALIGN_VECTOR_THRESHOLD && literal < ALIGN_OVERLAP_THRESHOLD) {
        continue;
      }
      const candidate: SentenceMatch = {
        sentence,
        vectorScore: vector,
        literalScore: literal,
        measurementMatch: measurement,
      };
      if (best === null || outranks(candidate, best)) best = candidate;
    }
    return best;
  });
}

/** How far past its own threshold a pair got — the scores are not on one scale, so averaging
 * them would let a near-miss on both outrank a clean hit on one. */
function margin(match: SentenceMatch): number {
  return Math.max(
    match.vectorScore - ALIGN_VECTOR_THRESHOLD,
    match.literalScore - ALIGN_OVERLAP_THRESHOLD,
  );
}

/** A shared measurement beats any similarity score: it identifies the claim rather than
 * resembling it. Between two of the same kind, the wider margin wins. */
function outranks(candidate: SentenceMatch, best: SentenceMatch): boolean {
  if (candidate.measurementMatch !== best.measurementMatch) return candidate.measurementMatch;
  return margin(candidate) > margin(best);
}
