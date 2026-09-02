/**
 * Purpose: the contextual-diversity factor (spec 033) — re-meeting a word in a familiar
 * context teaches less than meeting it somewhere new, so the scheduler discounts by the
 * closest stored context vector. Pure math; embedding I/O lives in the app layer. The cosine
 * and the hash are core primitives now (2026-09-02): this module's strict length check is the
 * one core-vectors adopted, and hashContext is core-random's fnv1aHex8 under its domain name.
 * Main exports: cosineSimilarity, noveltyFactor, hashContext.
 */
import { fnv1aHex8 } from "@breadcrumb/core-random";
import { cosineSimilarity } from "@breadcrumb/core-vectors";

export { cosineSimilarity } from "@breadcrumb/core-vectors";

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

/** Stable FNV-1a hash of a context sentence — the identity key for stored contexts. Written
 * into diglot_word_events.context_hash, so the construction must never change. */
export function hashContext(context: string): string {
  return fnv1aHex8(context);
}
