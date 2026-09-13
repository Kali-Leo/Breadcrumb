/**
 * Purpose: one judgement per turn — is this question still about the last one's subject? —
 * shared by the two decisions that both depend on it and must not disagree.
 *
 * Those two are: whether to spend the reranker (rerankPolicy.ts), and whether to paste the
 * topic's own words onto the front of an elliptical follow-up (followUpRewrite.ts). They are
 * different features, but a turn where one thinks the subject changed and the other thinks it
 * did not is a turn that reranks a rewritten question against the wrong pool. So the judgement
 * is made once, here, and both read it.
 *
 * The judgement itself is vocabulary overlap, and it is crude on purpose. The cost of getting
 * it wrong is one skipped rerank or one unhelpful prefix; anything cleverer would need a model
 * call, and asking a model whether to run a model is the wrong trade at this price.
 *
 * `observe` is idempotent within a turn: asking twice about the same question returns the same
 * answer rather than comparing the question to itself and declaring every turn a follow-up.
 * Main exports: createTopicTracker, TopicTracker, TOPIC_OVERLAP_THRESHOLD.
 */
import { analyze, type Stem } from "@breadcrumb/core-text";

/** Below this share of shared terms, the subject is treated as new. Two consecutive questions
 * about the same thing share most of their content words even when phrased differently; a
 * genuine change of subject rarely shares a third. */
export const TOPIC_OVERLAP_THRESHOLD = 0.34;

export interface TopicTracker {
  /** True when this question continues the previous one's subject. The first question of a
   * conversation is never a continuation — there is nothing for it to continue. */
  observe(question: string): boolean;
  reset(): void;
}

export interface TopicTrackerOptions {
  language?: string;
  stem?: Stem;
}

function overlap(previous: ReadonlySet<string>, next: ReadonlySet<string>): number {
  if (next.size === 0) return 1;
  let shared = 0;
  for (const term of next) if (previous.has(term)) shared += 1;
  return shared / next.size;
}

export function createTopicTracker(options: TopicTrackerOptions = {}): TopicTracker {
  let previous: Set<string> | null = null;
  let lastQuestion: string | null = null;
  let lastAnswer = false;
  return {
    observe(question) {
      if (question === lastQuestion) return lastAnswer;
      const terms = new Set(
        analyze(question, { language: options.language, stem: options.stem }).tokens,
      );
      const continues = previous !== null && overlap(previous, terms) >= TOPIC_OVERLAP_THRESHOLD;
      previous = terms;
      lastQuestion = question;
      lastAnswer = continues;
      return continues;
    },
    reset() {
      previous = null;
      lastQuestion = null;
      lastAnswer = false;
    },
  };
}
