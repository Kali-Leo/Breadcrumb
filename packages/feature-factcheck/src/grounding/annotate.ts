/**
 * Purpose: the three-tier label, assembled. One answer, its question and its topic passages
 * go in; one label per sentence comes out, with the source sentence to print beside it.
 *
 * The tiers are the ones the correctness-presentation research settles on: precise, per-claim,
 * in-place marks instead of a blanket warning, because a blanket warning measurably lowers
 * trust in the true parts of an answer while precise marks do not, and because leaving part of
 * an answer unmarked makes the unmarked part read as verified. So every sentence gets exactly
 * one of:
 *  - **grounded** — aligned to a source sentence AND the pairing check held. The source
 *    sentence travels with it so the reader never has to leave the page to see it.
 *  - **own** — the model's own explanation. Not an error and not hedged: most of a good
 *    lesson is this, and it is labelled in the first person rather than warned about.
 *  - **conflicting** — the sources themselves disagree about this sentence's figure. Both
 *    readings travel with it.
 * Only sentences that assert something are labelled. A heading (「二、峰顶怎么量」), a connective,
 * and above all a question put TO the learner (「那岩面高度大概会是多少？」) state nothing about the
 * world, so neither tier applies to them: marking a question 有资料 because the passage it
 * quotes a figure from exists says the source confirms something the sentence never claimed.
 * They are left unmarked rather than pushed into the wrong tier.
 * Main exports: CLAIM_MIN_TOKENS, GroundingLabel, GroundedSentence, AnswerGrounding,
 * annotateAnswer.
 */
import { alignSentences, type PassageSentence, passageSentences } from "./align";
import { pairingHolds, quoteExistsIn } from "./checks";
import { findConflict } from "./conflict";
import type { TopicPassage } from "./passages";
import { type SentenceSpan, splitSentences } from "./sentences";
import { contentTokens } from "./tokens";
import { ungroundedValues } from "./values";

export type GroundingLabel = "grounded" | "own" | "conflicting";

/** Below this many content tokens a sentence is a heading or a connective rather than a claim.
 * Four rather than three because CJK bigrams inflate the count: 「一、高度基准」 yields three and
 * has to fall below the line, while 「8848.86 米（雪面高程）。」 yields five and must not. */
export const CLAIM_MIN_TOKENS = 4;

/** Question marks across the scripts the product ships in. */
const QUESTION_ENDING = /[？?؟]\s*$/;

/** True when the sentence asserts something that could be checked against a source. */
function isClaim(sentence: string): boolean {
  if (QUESTION_ENDING.test(sentence)) return false;
  return contentTokens(sentence).length >= CLAIM_MIN_TOKENS;
}

export interface GroundedSentence {
  /** Position in the answer, 0-based. The one stable identity a sentence has: two sentences
   * of an answer can read identically, and the label belongs to the position, not the text. */
  order: number;
  text: string;
  /** Where the sentence sits in the answer, so the mark can go where the reader is looking.
   * `end` is just past its last non-whitespace character — the mark's anchor. */
  start: number;
  end: number;
  label: GroundingLabel;
  /** The source sentence behind a grounded (or conflicting) label, verbatim. */
  quote: PassageSentence | null;
  /** The other reading, on a conflicting label only. */
  rival: PassageSentence | null;
  /** Figures this sentence states that appear neither in the question nor in any passage. */
  ungroundedValues: string[];
}

export interface AnswerGrounding {
  sentences: GroundedSentence[];
  /** How many sentences carry each label — what a summary line counts. */
  counts: Record<GroundingLabel, number>;
}

/** What the caller supplies. Vectors are row-aligned with the sentence lists the caller got
 * from `answerSentencesOf` / `passageSentences`; null on both when no embedder is available,
 * and the literal gate carries alignment alone. */
export interface AnnotateInput {
  answer: string;
  question: string;
  passages: readonly TopicPassage[];
  answerVectors: readonly (readonly number[])[] | null;
  sourceVectors: readonly (readonly number[])[] | null;
}

/** The answer's sentences, exactly as the annotator will see them — exported so the caller
 * can embed the same list it will later hand back as `answerVectors`. */
export function answerSentencesOf(answer: string): SentenceSpan[] {
  return splitSentences(answer).filter((sentence) => isClaim(sentence.text));
}

export { passageSentences };

export function annotateAnswer(input: AnnotateInput): AnswerGrounding {
  const answerSentences = answerSentencesOf(input.answer);
  const sources = passageSentences(input.passages);
  const matches = alignSentences({
    answerSentences: answerSentences.map((sentence) => sentence.text),
    sourceSentences: sources,
    answerVectors: input.answerVectors,
    sourceVectors: input.sourceVectors,
  });
  const passageTexts = input.passages.map((passage) => passage.text);

  const sentences = answerSentences.map((sentence, index) =>
    labelSentence({
      order: index,
      text: sentence.text,
      start: sentence.start,
      end: sentence.end,
      match: matches[index] ?? null,
      sources,
      passages: input.passages,
      passageTexts,
      question: input.question,
    }),
  );
  const counts: Record<GroundingLabel, number> = { grounded: 0, own: 0, conflicting: 0 };
  for (const sentence of sentences) counts[sentence.label] += 1;
  return { sentences, counts };
}

function labelSentence(input: {
  order: number;
  text: string;
  start: number;
  end: number;
  match: { sentence: PassageSentence } | null;
  sources: readonly PassageSentence[];
  passages: readonly TopicPassage[];
  passageTexts: readonly string[];
  question: string;
}): GroundedSentence {
  const ungrounded = ungroundedValues(input.text, input.question, input.passageTexts).map(
    (value) => value.text,
  );
  const quote = input.match?.sentence ?? null;
  // Every gate in order: aligned, the pairing check, the existence check, and no invented
  // figure. Any one of them failing means this sentence is the model's own, which is a label
  // and not a complaint.
  const grounded =
    quote !== null &&
    pairingHolds(input.text, quote.text) &&
    quoteExistsIn(quote.text, input.passages) &&
    ungrounded.length === 0;
  if (!grounded) {
    return {
      ...placement(input),
      label: "own",
      quote: null,
      rival: null,
      ungroundedValues: ungrounded,
    };
  }
  const conflict = findConflict(input.text, quote, input.sources);
  if (conflict !== null) {
    return {
      ...placement(input),
      label: "conflicting",
      quote: conflict.agreeing,
      rival: conflict.disagreeing,
      ungroundedValues: [],
    };
  }
  return { ...placement(input), label: "grounded", quote, rival: null, ungroundedValues: [] };
}

/** The three fields that say which sentence this is and where it sits. */
function placement(input: { order: number; text: string; start: number; end: number }) {
  return { order: input.order, text: input.text, start: input.start, end: input.end };
}
