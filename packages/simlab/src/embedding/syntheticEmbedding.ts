/**
 * Purpose: deterministic, dependency-free stand-in for the app's local ONNX embedding
 * (multilingual-e5-small via fastembed) — hashes character bigrams of a text into a fixed
 * L2-normalized vector, so rankCandidatePairs' cosine-similarity path is exercisable in the
 * harness without ONNX or network access. Divergence from production is deliberate (spec
 * 013 T1) and documented here rather than in the runner.
 * Main exports: computeSyntheticEmbedding, computeSyntheticNodeEmbedding,
 * SYNTHETIC_EMBEDDING_DIMENSIONS, SYNTHETIC_EMBEDDING_MODEL.
 */

export const SYNTHETIC_EMBEDDING_DIMENSIONS = 64;

/** Recorded as node_embeddings.model — distinguishes simlab runs from real fastembed output
 * at a glance if a database were ever inspected side by side. */
export const SYNTHETIC_EMBEDDING_MODEL = "simlab-synthetic-bigram-hash";

/** Character-bigram hash embedding: same text always yields the same vector; texts sharing
 * more bigrams land closer together in cosine space than unrelated texts. */
export function computeSyntheticEmbedding(text: string): number[] {
  const vector = new Array<number>(SYNTHETIC_EMBEDDING_DIMENSIONS).fill(0);
  for (const bigram of extractBigrams(text)) {
    const hash = fnv1aHash(bigram);
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

/** FNV-1a, 32-bit — a small, well-known, dependency-free string hash; not cryptographic,
 * just needs to spread bigrams evenly across the vector's dimensions. */
function fnv1aHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function l2Normalize(vector: readonly number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return [...vector];
  return vector.map((value) => value / norm);
}
