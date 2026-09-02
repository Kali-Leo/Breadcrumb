/**
 * Purpose: the contextual-diversity factor (spec 033) — re-meeting a word in a familiar
 * context teaches less than meeting it somewhere new, so the scheduler discounts by the
 * closest stored context vector. Pure math; embedding I/O lives in the app layer.
 * Main exports: cosineSimilarity, noveltyFactor, hashContext.
 */

/** Cosine similarity of two vectors; 0 for mismatched or zero-length input. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Novelty in [0.5, 1.5]: 1.5 for a context unlike anything stored, 0.5 for a repeat of a
 * known context, 1.2 for a word with no stored contexts yet (first-context bonus), and 1
 * when no current vector is available (embedding down — neutral degrade). */
export function noveltyFactor(
  currentVector: readonly number[] | null,
  pastVectors: readonly (readonly number[])[],
): number {
  if (currentVector === null) return 1;
  if (pastVectors.length === 0) return 1.2;
  let maxSimilarity = 0;
  for (const past of pastVectors) {
    maxSimilarity = Math.max(maxSimilarity, cosineSimilarity(currentVector, past));
  }
  return Math.min(1.5, Math.max(0.5, 1.5 - maxSimilarity));
}

/** Stable FNV-1a hash of a context sentence — the identity key for stored contexts. */
export function hashContext(context: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < context.length; index += 1) {
    hash ^= context.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
