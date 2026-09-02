/**
 * Purpose: FNV-1a over UTF-16 code units — the one string→number hash the product seeds
 * everything deterministic from. Tiny, dependency-free, stable across sessions and platforms;
 * not cryptographic, and nothing here should ever be asked to be.
 *
 * Extracted 2026-09-02 from six byte-identical private copies (feature-map, feature-factcheck,
 * feature-companion, feature-diglot-weave, simlab, and the desktop concept-vector cache).
 * Two deliberate non-members stay where they are, because their output is baked into data the
 * learner already has: feature-diglot-weave/vocabTest.ts's hashToInt (Math.abs instead of
 * >>> 0 — a different number, and it picks which distractors a saved test shows) and
 * feature-browsing-interest/wordCloudLayout.ts's Park–Miller LCG (it decides where words sit).
 * Main exports: fnv1a32, fnv1aHex8, seedFromStrings.
 */

const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;

/** FNV-1a as an unsigned 32-bit integer. */
export function fnv1a32(text: string): number {
  let hash = FNV_OFFSET_BASIS_32;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME_32);
  }
  return hash >>> 0;
}

/** The same hash as eight lowercase hex digits — the form used as a content/identity key
 * (stored context hashes, embedding cache keys) where a short stable string reads better in a
 * database column than a number. */
export function fnv1aHex8(text: string): string {
  return fnv1a32(text).toString(16).padStart(8, "0");
}

/** Combines any number of strings into one 32-bit seed, so distinct input tuples get
 * distinct-but-reproducible streams. Equivalent to hashing the concatenation — the parts are
 * a convenience for callers, not a separator-aware encoding. */
export function seedFromStrings(parts: readonly string[]): number {
  let hash = FNV_OFFSET_BASIS_32;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, FNV_PRIME_32);
    }
  }
  return hash >>> 0;
}
