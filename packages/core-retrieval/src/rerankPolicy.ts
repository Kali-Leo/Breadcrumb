/**
 * Purpose: when to spend the reranker.
 *
 * The second stage is the single largest quality gain in the whole retrieval chain — macro
 * nDCG@10 from 0.476 to 0.750, above every single route, and not one of eleven corpora came
 * out worse. It also costs 4.9 seconds for fifty pairs on a desktop processor and 0.1 seconds
 * on a graphics card, a factor of forty-seven. So the rule is not "always" and it is not
 * "never": run it when the candidate pool is likely to have changed, which in a conversation
 * means when the subject changed, and run it every turn where it is nearly free.
 *
 * The subject judgement is topicDrift.ts, shared with the follow-up rewrite so that the two
 * cannot disagree inside one turn — a turn that rewrote the question as a follow-up and then
 * reranked it as a new subject would be reranking against the wrong pool.
 * Main exports: createRerankPolicy, RerankPolicy, RerankPolicyOptions.
 */
import { createTopicTracker, type TopicTrackerOptions } from "./topicDrift";

export interface RerankPolicy {
  /** Whether this question is worth a rerank. Records the question either way. */
  shouldRerank(question: string): boolean;
  /** Forget the conversation so far — a new chat starts a new subject by definition. */
  reset(): void;
}

export interface RerankPolicyOptions extends TopicTrackerOptions {
  /** True where the reranker runs on a graphics card, which is where it costs milliseconds. */
  everyTurn?: boolean;
}

export function createRerankPolicy(options: RerankPolicyOptions = {}): RerankPolicy {
  const tracker = createTopicTracker(options);
  return {
    shouldRerank(question) {
      // The first question of a conversation always earns one: there is no previous pool for
      // a ranking to be carried over from, which is what tracker.observe already says.
      return options.everyTurn === true || !tracker.observe(question);
    },
    reset() {
      tracker.reset();
    },
  };
}
