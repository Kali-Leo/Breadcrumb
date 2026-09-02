/**
 * Purpose: deterministic, dependency-free stand-in for the app's local ONNX embedding
 * (multilingual-e5-small via fastembed) — hashes character bigrams of a text into a fixed
 * L2-normalized vector, so rankCandidatePairs' cosine-similarity path is exercisable in the
 * harness without ONNX or network access. Divergence from production is deliberate (spec
 * 013 T1) and documented here rather than in the runner. The hash and the normalization are
 * the shared core primitives (2026-09-02) — core-vectors' l2Normalize keeps this module's
 * "a zero vector comes back as a zero vector" rule, which packVectors deliberately does not.
 * Main exports: computeSyntheticEmbedding, computeSyntheticNodeEmbedding,
 * SYNTHETIC_EMBEDDING_DIMENSIONS, SYNTHETIC_EMBEDDING_MODEL.
 */
import { fnv1a32 } from "@breadcrumb/core-random";
import { l2Normalize } from "@breadcrumb/core-vectors";

export const SYNTHETIC_EMBEDDING_DIMENSIONS = 64;

/** Recorded as node_embeddings.model — distinguishes simlab runs from real fastembed output
 * at a glance if a database were ever inspected side by side. */
export const SYNTHETIC_EMBEDDING_MODEL = "simlab-synthetic-bigram-hash";

/** Character-bigram hash embedding: same text always yields the same vector; texts sharing
 * more bigrams land closer together in cosine space than unrelated texts. */
export function computeSyntheticEmbedding(text: string): number[] {
  const vector = new Array<number>(SYNTHETIC_EMBEDDING_DIMENSIONS).fill(0);
  for (const bigram of extractBigrams(text)) {
    const hash = fnv1a32(bigram);
    const index = hash % SYNTHETIC_EMBEDDING_DIMENSIONS;
    // The hash's low bit picks a sign so bigram mass spreads across +/- instead of every
    // text trending toward the same all-positive direction.
    const sign = (hash & 1) === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign;
  }
  return l2Normalize(vector);
}

/** Mirrors apps/desktop/src/lib/platform/embeddings.ts's `${label}: ${summary}` input convention, so
 * the harness embeds the same textual signal the app does — just with a synthetic vectorizer. */
export function computeSyntheticNodeEmbedding(label: string, summary: string): number[] {
  return computeSyntheticEmbedding(`${label}: ${summary}`);
}

function extractBigrams(text: string): string[] {
  const chars = [...text.trim().toLowerCase()];
  if (chars.length < 2) return chars.length === 1 ? [`${chars[0]}${chars[0]}`] : [];
  const bigrams: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    bigrams.push(`${chars[index]}${chars[index + 1]}`);
  }
  return bigrams;
}
