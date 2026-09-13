/**
 * Purpose: making an elliptical follow-up searchable again.
 *
 * "那它有多高？" carries none of the words that would find its answer. The first retrieval
 * stage is where that damage happens and it is where it has to be repaired: measured, dropping
 * the highest-IDF content word from a question costs 53% of nDCG@10 and 51% of Recall@8, and
 * **no amount of reranking gets it back** — a second stage can only reorder passages the first
 * stage found, and the right ones were never in the pool.
 *
 * The repair is blunt and that is the finding, not a shortcut. Pasting the topic's one or two
 * heaviest entity words onto the front of the question recovers 92% of the loss on clean
 * context. The obvious refinement — only paste when the question is actually missing a
 * high-weight word — recovers 76%. It is worse, so it is not done: the condition that looks
 * careful is the condition that misses the cases where the missing word is missing in a way no
 * rule spotted.
 *
 * The one gate is drift. On a genuine change of subject the previous topic's words are not
 * context, they are contamination, so a new subject is left exactly as the reader wrote it.
 * That judgement comes from topicDrift.ts, shared with the rerank decision so the two cannot
 * disagree within a turn.
 *
 * What this is NOT is a substitute for the model rewriting the question, and the measurement
 * says where the line is. The 92% holds when the previous turn was about one thing. Widen the
 * context to three sentences on two subjects and picking the heaviest word finds the one that
 * was actually missing about six times in ten, and recovery falls to 43%. So the quality of
 * this repair is the quality of `topicEntities`, which is the caller's to compute — and a
 * caller that hands over the entities of a muddled context gets a muddled repair, not a
 * failure it can see.
 * Main exports: createFollowUpRewriter, prefixTopicEntities, MAX_TOPIC_ENTITIES.
 */
import { createTopicTracker, type TopicTrackerOptions } from "./topicDrift";

/** One or two. Three starts to outweigh the question itself in a bag-of-words ranking, which
 * turns a follow-up into a repeat of the previous turn. */
export const MAX_TOPIC_ENTITIES = 2;

/** The rewrite itself, with no opinion about whether it should happen. Entities go in front so
 * that the reader's own words keep their position and their order; blank entries are dropped
 * rather than pasted as spaces. */
export function prefixTopicEntities(question: string, topicEntities: readonly string[]): string {
  const entities = topicEntities
    .map((entity) => entity.trim())
    .filter((entity) => entity !== "")
    .slice(0, MAX_TOPIC_ENTITIES);
  return entities.length === 0 ? question : `${entities.join(" ")} ${question}`;
}

export interface FollowUpRewriter {
  /**
   * The question to actually retrieve with. `topicEntities` are the heaviest entity words of
   * the material the current topic is being answered from, computed by the caller when it
   * fetched that material — this layer has no idea what the conversation is about and should
   * not pretend to.
   */
  rewriteFollowUp(question: string, topicEntities: readonly string[]): string;
  /** Whether this turn is worth a rerank: see rerankPolicy.ts for why it is not every turn. */
  shouldRerank(question: string): boolean;
  reset(): void;
}

export interface FollowUpRewriterOptions extends TopicTrackerOptions {
  /** True where the reranker runs on a graphics card and therefore costs milliseconds. */
  rerankEveryTurn?: boolean;
}

/**
 * One of these per conversation. Both methods may be called for the same question in either
 * order; the drift judgement is made once for that question and reused, so they always agree.
 */
export function createFollowUpRewriter(options: FollowUpRewriterOptions = {}): FollowUpRewriter {
  const tracker = createTopicTracker(options);
  return {
    rewriteFollowUp(question, topicEntities) {
      return tracker.observe(question) ? prefixTopicEntities(question, topicEntities) : question;
    },
    shouldRerank(question) {
      const sameTopic = tracker.observe(question);
      return options.rerankEveryTurn === true || !sameTopic;
    },
    reset() {
      tracker.reset();
    },
  };
}
