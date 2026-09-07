import { describe, expect, it } from "vitest";
import {
  type ClassificationInput,
  isDistribution,
  needsEmbeddingUpgrade,
  resolveClassification,
} from "./classifierLayers";
import type { EventClassification } from "./events";
import { EMOTION_VALENCES, TOPIC_LEAVES } from "./taxonomy";

const TOPICS = 4;
const EMOTIONS = EMOTION_VALENCES.length;

function evenly(length: number): number[] {
  return Array.from({ length }, () => 1 / length);
}

function peaked(length: number, at: number): number[] {
  return Array.from({ length }, (_, index) => (index === at ? 1 : 0));
}

function resolve(input: Partial<ClassificationInput>) {
  return resolveClassification(
    { ngram: null, embedding: null, embeddingAvailable: true, ...input },
    TOPICS,
    EMOTIONS,
  );
}

describe("isDistribution", () => {
  it("accepts a distribution that sums to one", () => {
    expect(isDistribution(evenly(4), 4)).toBe(true);
    expect(isDistribution(peaked(4, 2), 4)).toBe(true);
  });

  it("rejects the wrong length, null, negatives, NaN and anything that does not sum to one", () => {
    expect(isDistribution(evenly(3), 4)).toBe(false);
    expect(isDistribution(null, 4)).toBe(false);
    expect(isDistribution([1.5, -0.5, 0, 0], 4)).toBe(false);
    expect(isDistribution([Number.NaN, 0, 0, 0], 4)).toBe(false);
    expect(isDistribution([0.5, 0.2, 0, 0], 4)).toBe(false);
    expect(isDistribution([], 0)).toBe(false);
  });
});

describe("which layer wins", () => {
  const ngram = {
    topicProbabilities: peaked(TOPICS, 0),
    emotionProbabilities: peaked(EMOTIONS, 0),
  };
  const embedding = {
    topicProbabilities: peaked(TOPICS, 1),
    emotionProbabilities: peaked(EMOTIONS, 1),
  };

  it("prefers the embedding layer when it is available and well formed", () => {
    const resolved = resolve({ ngram, embedding });
    expect(resolved?.topicProbabilities).toEqual(embedding.topicProbabilities);
    expect(resolved?.classifier).toBe("embedding");
    expect(resolved?.topicClassifier).toBe("embedding");
    expect(resolved?.emotionClassifier).toBe("embedding");
  });

  it("falls back to n-gram when embeddings are switched off, even if a stale one is passed", () => {
    const resolved = resolve({ ngram, embedding, embeddingAvailable: false });
    expect(resolved?.topicProbabilities).toEqual(ngram.topicProbabilities);
    expect(resolved?.classifier).toBe("ngram");
  });

  it("falls back to n-gram when the embedding layer produced nothing", () => {
    expect(resolve({ ngram, embedding: null })?.classifier).toBe("ngram");
  });

  it("falls back to n-gram when the embedding distribution is malformed", () => {
    const broken = {
      topicProbabilities: [Number.NaN, 0, 0, 0],
      emotionProbabilities: peaked(EMOTIONS, 1),
    };
    const resolved = resolve({ ngram, embedding: broken });
    expect(resolved?.topicProbabilities).toEqual(ngram.topicProbabilities);
    // Heads resolve independently: a broken topic vector does not throw away a good mood one.
    expect(resolved?.topicClassifier).toBe("ngram");
    expect(resolved?.emotionClassifier).toBe("embedding");
    expect(resolved?.classifier).toBe("ngram+embedding");
  });

  it("uses the embedding emotion head when the n-gram layer has none", () => {
    const noMood = { topicProbabilities: ngram.topicProbabilities, emotionProbabilities: null };
    const resolved = resolve({ ngram: noMood, embedding });
    expect(resolved?.classifier).toBe("embedding");
    expect(resolved?.emotionProbabilities).toEqual(embedding.emotionProbabilities);
  });

  it("reports no emotion at all when neither layer has one", () => {
    const resolved = resolve({
      ngram: { topicProbabilities: ngram.topicProbabilities, emotionProbabilities: null },
    });
    expect(resolved?.emotionProbabilities).toBeUndefined();
    expect(resolved?.emotionClassifier).toBeNull();
    expect(resolved?.classifier).toBe("ngram");
  });

  it("returns null when no layer offers a usable topic distribution", () => {
    expect(resolve({})).toBeNull();
    expect(
      resolve({ ngram: { topicProbabilities: [0, 0, 0, 0], emotionProbabilities: null } }),
    ).toBeNull();
    expect(resolve({ embedding, embeddingAvailable: false })).toBeNull();
  });

  it("hands back something ./events can store as it stands", () => {
    const resolved = resolve({ ngram, embedding });
    if (resolved === null) throw new Error("expected a classification");
    // Structural, not decorative: the resolver's whole job is to produce the row shape
    // normalizeEvent takes, `classifier` string included.
    const forStorage: EventClassification = resolved;
    expect(forStorage.classifier).toBe("embedding");
    expect(forStorage.topicProbabilities).toHaveLength(TOPICS);
    expect(EMOTION_VALENCES).toHaveLength(EMOTIONS);
  });

  it("defaults to the shipped taxonomy sizes when no counts are given", () => {
    const full = {
      topicProbabilities: evenly(TOPIC_LEAVES.length),
      emotionProbabilities: evenly(EMOTION_VALENCES.length),
    };
    expect(
      resolveClassification({ ngram: full, embedding: null, embeddingAvailable: false }),
    ).not.toBeNull();
    expect(resolveClassification({ ngram, embedding: null, embeddingAvailable: false })).toBeNull();
  });
});

describe("needsEmbeddingUpgrade", () => {
  it("never re-runs while embeddings are unavailable", () => {
    expect(needsEmbeddingUpgrade("ngram", false)).toBe(false);
    expect(needsEmbeddingUpgrade(null, false)).toBe(false);
  });

  it("re-runs rows the n-gram layer wrote, and rows nothing has classified yet", () => {
    expect(needsEmbeddingUpgrade("ngram", true)).toBe(true);
    expect(needsEmbeddingUpgrade("ngram+embedding", true)).toBe(true);
    expect(needsEmbeddingUpgrade(null, true)).toBe(true);
    expect(needsEmbeddingUpgrade("", true)).toBe(true);
  });

  it("leaves a row the embedding layer already wrote alone", () => {
    expect(needsEmbeddingUpgrade("embedding", true)).toBe(false);
  });
});
