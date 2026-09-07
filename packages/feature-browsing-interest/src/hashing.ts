/**
 * Purpose: the feature side of the topic classifier — MurmurHash3 (x86, 32-bit) over UTF-8
 * bytes, and the hashed character n-gram counts the multinomial logistic regression consumes.
 * This is the JS/Python-aligned hashing trick: it reproduces scikit-learn's
 * HashingVectorizer(analyzer="char", ngram_range=(1,3), n_features=8192, alternate_sign=False)
 * the classifier was fitted with, so the same title lands on the same features here as it did
 * in training.
 *
 * Ported from Kali-Leo/feed-mode (`interest-model/lite/interest_lite.js`, lines 11-43 — the
 * `mmh3` function and the feature half of `proba`), GPL-3.0, same copyright holder; modified
 * 2026-09-07 (JavaScript → TypeScript, feature extraction split out of scoring, the string
 * assembly made an explicit parameter instead of being hard-coded inside `proba`).
 *
 * Two details are load-bearing and must not be "cleaned up":
 * - the string is split with `Array.from`, i.e. by Unicode code point, not by UTF-16 unit, so
 *   a title containing an astral character (emoji) grams the same way it did in training;
 * - counts are accumulated in a Map and later consumed in insertion order, which fixes the
 *   summation order of the score and therefore its exact floating-point value.
 * Main exports: murmurHash3, hashedNgramCounts, NGRAM_MIN, NGRAM_MAX.
 */

/** Character n-gram range, matching the fitted HashingVectorizer. */
export const NGRAM_MIN = 1;
export const NGRAM_MAX = 3;

const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;

/** `bytes[i]`, or 0 past the end — the tail block below is already index-guarded, this only
 * satisfies noUncheckedIndexedAccess without changing a single arithmetic step. */
function at(bytes: Uint8Array, index: number): number {
  return bytes[index] ?? 0;
}

/**
 * MurmurHash3 x86 32-bit with seed 0, returning a *signed* 32-bit int — the same convention as
 * `sklearn.utils.murmurhash3_32(..., positive=False)`, whose sign the vectoriser then discards
 * with `abs`.
 */
export function murmurHash3(bytes: Uint8Array): number {
  let h = 0;
  const body = bytes.length - (bytes.length % 4);
  for (let i = 0; i < body; i += 4) {
    let k =
      (at(bytes, i) |
        (at(bytes, i + 1) << 8) |
        (at(bytes, i + 2) << 16) |
        (at(bytes, i + 3) << 24)) >>>
      0;
    k = Math.imul(k, C1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, C2);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
  }
  let k = 0;
  const tail = bytes.length % 4;
  if (tail >= 3) k ^= at(bytes, body + 2) << 16;
  if (tail >= 2) k ^= at(bytes, body + 1) << 8;
  if (tail >= 1) {
    k ^= at(bytes, body);
    k = Math.imul(k >>> 0, C1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, C2);
    h ^= k;
  }
  h ^= bytes.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h | 0;
}

const encoder = new TextEncoder();

/**
 * Character 1..3-grams of `text`, hashed into `dimensions` buckets and counted. Insertion order
 * is the order the grams were first seen (n ascending, then position ascending); callers that
 * care about exact floating-point reproducibility must consume it in that order.
 */
export function hashedNgramCounts(text: string, dimensions: number): Map<number, number> {
  const chars = Array.from(text);
  const counts = new Map<number, number>();
  for (let n = NGRAM_MIN; n <= NGRAM_MAX; n++) {
    for (let i = 0; i + n <= chars.length; i++) {
      const gram = chars.slice(i, i + n).join("");
      const index = Math.abs(murmurHash3(encoder.encode(gram))) % dimensions;
      counts.set(index, (counts.get(index) ?? 0) + 1);
    }
  }
  return counts;
}

/** L2 norm of the counts, with the vectoriser's guard: an all-zero vector normalises by 1. */
export function countsL2Norm(counts: ReadonlyMap<number, number>): number {
  let squared = 0;
  for (const value of counts.values()) squared += value * value;
  return Math.sqrt(squared) || 1;
}
