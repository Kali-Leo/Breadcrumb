/**
 * Purpose: the contract between the two classification layers — which one's answer counts for
 * a given event, and what the profile's `classifier` field (schemas.ts) should then say.
 *
 * There are two, for the reason feed-mode's daemon has two (interest-model/daemon/app.py,
 * class Classifier: embeddings when they load, n-gram when they don't):
 *   - n-gram (layer A): synchronous, microseconds, cannot fail. Every event gets an answer the
 *     moment it arrives, so the page is never empty.
 *   - embedding (layer B): needs multilingual-e5-small, is asynchronous, and returns null
 *     whenever the model is not downloaded or the network switch is off
 *     (apps/desktop/src/lib/platform/embeddings.ts). More accurate when it works.
 * So: A writes on arrival, B overwrites in the background when it can. B never blocks A, and
 * a B failure is silent — the A answer already in the row stays valid.
 *
 * The heads are resolved independently. They are separate classifiers over the same vector,
 * and layer A may ship a topic head before it ships an emotion head; taking the best available
 * per head beats discarding a good topic answer because the emotion one is missing.
 *
 * The result is an `EventClassification` (./events), so it goes straight into `normalizeEvent`
 * — including the `classifier` string, which is what the profile's `classifier` field
 * (schemas.ts) reports and what the background pass reads back to decide whether a row is
 * still worth upgrading.
 *
 * Ported from Kali-Leo/feed-mode (interest-model/daemon/app.py, class Classifier), GPL-3.0,
 * re-licensed AGPL-3.0-only by the copyright holder; modified 2026-09 (the daemon picks a mode
 * once at startup and never revisits it; here the choice is per event, because in this app
 * embeddings can appear and disappear while the app is running).
 * Main exports: resolveClassification, needsEmbeddingUpgrade, isDistribution, ClassifierLayer.
 */
import type { EventClassification } from "./events";
import { EMOTION_NAMES, TOPIC_LEAVES } from "./taxonomy";

/** The value written to the profile's `classifier` field for a single head. */
export type ClassifierLayer = "embedding" | "ngram";

/** What either layer hands in. `emotionProbabilities` is null or absent for a layer that has
 * no emotion head — which is how feed-mode's n-gram fallback shipped (app.py:126-133). */
export interface LayerOutput {
  readonly topicProbabilities: readonly number[];
  readonly emotionProbabilities?: readonly number[] | null | undefined;
}

export interface ResolvedClassification extends EventClassification {
  readonly topicProbabilities: readonly number[];
  /** Undefined when neither layer produced an emotion distribution — the shape ./events
   * already uses for "this row has no mood". */
  readonly emotionProbabilities: readonly number[] | undefined;
  /** For the profile's `classifier` field: one layer name when both heads came from the same
   * place, otherwise "topic+emotion" so a mixed row can be told apart from a clean one. */
  readonly classifier: string;
  readonly topicClassifier: ClassifierLayer;
  readonly emotionClassifier: ClassifierLayer | null;
}

export interface ClassificationInput {
  /** Layer A. Synchronous and always available in principle — but null while the caller has
   * not run it yet (an event stored before the n-gram head shipped, say). */
  readonly ngram: LayerOutput | null;
  /** Layer B. Null when it has not been run, or when it ran and the embedder returned null. */
  readonly embedding: LayerOutput | null;
  /** The app's live answer to "can we embed right now?". False makes any `embedding` value
   * ignored outright, so a stale distribution can never be presented as current. */
  readonly embeddingAvailable: boolean;
}

const SUM_TOLERANCE = 1e-3;

/** A distribution is only usable if it is one: right length, all finite, none negative, sums
 * to 1. Anything else is a bug or a corrupted row, and both should fall through to the other
 * layer rather than be averaged into the profile. */
export function isDistribution(values: readonly number[] | null, length: number): boolean {
  if (values === null || values.length !== length) return false;
  let total = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) return false;
    total += value;
  }
  return Math.abs(total - 1) <= SUM_TOLERANCE;
}

interface Candidate<T> {
  readonly value: T;
  readonly layer: ClassifierLayer;
}

function pick<T>(
  embedding: T | null,
  ngram: T | null,
  usable: (value: T) => boolean,
): Candidate<T> | null {
  if (embedding !== null && usable(embedding)) return { value: embedding, layer: "embedding" };
  if (ngram !== null && usable(ngram)) return { value: ngram, layer: "ngram" };
  return null;
}

/**
 * Picks the answer for one event. Returns null only when neither layer offers a usable topic
 * distribution — the caller should then leave the event unclassified and retry later, not
 * store zeros.
 */
export function resolveClassification(
  input: ClassificationInput,
  topicCount: number = TOPIC_LEAVES.length,
  emotionCount: number = EMOTION_NAMES.length,
): ResolvedClassification | null {
  const embedding = input.embeddingAvailable ? input.embedding : null;
  const topic = pick(
    embedding?.topicProbabilities ?? null,
    input.ngram?.topicProbabilities ?? null,
    (value) => isDistribution(value, topicCount),
  );
  if (topic === null) return null;
  const emotion = pick(
    embedding?.emotionProbabilities ?? null,
    input.ngram?.emotionProbabilities ?? null,
    (value) => isDistribution(value, emotionCount),
  );
  const classifier =
    emotion === null || emotion.layer === topic.layer
      ? topic.layer
      : `${topic.layer}+${emotion.layer}`;
  return {
    topicProbabilities: topic.value,
    emotionProbabilities: emotion?.value,
    classifier,
    topicClassifier: topic.layer,
    emotionClassifier: emotion?.layer ?? null,
  };
}

/**
 * Whether the background pass should re-classify a stored row. Only rows the n-gram layer
 * wrote are worth re-running, and only while embeddings actually work — otherwise the pass
 * would burn a 130 ms embedding per event to arrive at the same answer, or at no answer.
 */
export function needsEmbeddingUpgrade(
  storedClassifier: string | null,
  embeddingAvailable: boolean,
): boolean {
  if (!embeddingAvailable) return false;
  if (storedClassifier === null || storedClassifier === "") return true;
  return storedClassifier.includes("ngram");
}
