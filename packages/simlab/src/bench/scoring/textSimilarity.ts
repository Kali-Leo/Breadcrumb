/**
 * Purpose: the mechanical similarity primitives every purpose's comparator is built out of.
 * Nothing here knows what a knowledge node or a claim is — it compares labels, sets of
 * labels, free sentences and ordered tiers, and each function returns a plain 0..1 number so
 * the report can put very different purposes in the same column.
 *
 * No LLM judges anything in this file: an agreement score produced by asking a model whether
 * two answers agree would inherit exactly the capability differences the bench is trying to
 * measure.
 *
 * Main exports: normaliseLabel, diceBigram, bigramCoverage, exactSetF1, fuzzySetF1,
 * ordinalAgreement, ratioScore, meanScore.
 */

/** Case-folded, whitespace-collapsed form used whenever two labels are compared for identity.
 * Deliberately not stripping punctuation: "map()" and "map" are different labels in a
 * knowledge tree, and pretending otherwise would flatter every model equally. */
export function normaliseLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

function bigrams(text: string): string[] {
  const chars = [...normaliseLabel(text)];
  if (chars.length < 2) return chars;
  return chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1] ?? ""}`);
}

/**
 * Sørensen–Dice over character bigrams: 1 for identical strings, ~0 for unrelated ones,
 * and — unlike exact match — a usable middle for two sentences that say the same thing in
 * slightly different words. Script-agnostic, which matters when the same purpose is scored in
 * Chinese, Bengali and Swahili.
 */
export function diceBigram(a: string, b: string): number {
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.length === 0 && right.length === 0)
    return normaliseLabel(a) === normaliseLabel(b) ? 1 : 0;
  if (left.length === 0 || right.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const gram of left) pool.set(gram, (pool.get(gram) ?? 0) + 1);
  let shared = 0;
  for (const gram of right) {
    const remaining = pool.get(gram) ?? 0;
    if (remaining > 0) {
      shared += 1;
      pool.set(gram, remaining - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

/**
 * How much of `part` is present in `whole`, as a fraction of `part`'s character bigrams.
 * Asymmetric on purpose: this answers "is this sentence drawn from that text", which is the
 * question behind a hallucinated claim, not "are these two texts alike".
 */
export function bigramCoverage(part: string, whole: string): number {
  const grams = bigrams(part);
  if (grams.length === 0) return 1;
  const pool = new Set(bigrams(whole));
  return grams.filter((gram) => pool.has(gram)).length / grams.length;
}

function f1(shared: number, referenceSize: number, candidateSize: number): number {
  if (referenceSize === 0 && candidateSize === 0) return 1;
  if (shared === 0) return 0;
  const precision = shared / candidateSize;
  const recall = shared / referenceSize;
  return (2 * precision * recall) / (precision + recall);
}

/** F1 over two label sets compared by exact (normalised) identity. Both empty scores 1 —
 * agreeing that there is nothing to say is agreement. */
export function exactSetF1(reference: readonly string[], candidate: readonly string[]): number {
  const wanted = new Set(reference.map(normaliseLabel));
  const got = new Set(candidate.map(normaliseLabel));
  let shared = 0;
  for (const label of got) if (wanted.has(label)) shared += 1;
  return f1(shared, wanted.size, got.size);
}

/**
 * F1 over two sets of free text, matched greedily by Dice similarity above `threshold`.
 * Greedy rather than optimal (Hungarian) on purpose: the sets here are at most a couple of
 * dozen short strings, and a greedy pass over similarity-sorted pairs differs from the
 * optimal assignment far less than the noise between two runs of the same model.
 */
export function fuzzySetF1(
  reference: readonly string[],
  candidate: readonly string[],
  threshold = 0.5,
): number {
  if (reference.length === 0 && candidate.length === 0) return 1;
  if (reference.length === 0 || candidate.length === 0) return 0;
  const pairs: { ref: number; cand: number; score: number }[] = [];
  reference.forEach((ref, refIndex) => {
    candidate.forEach((cand, candIndex) => {
      const score = diceBigram(ref, cand);
      if (score >= threshold) pairs.push({ ref: refIndex, cand: candIndex, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score || a.ref - b.ref || a.cand - b.cand);
  const usedRefs = new Set<number>();
  const usedCands = new Set<number>();
  let shared = 0;
  for (const pair of pairs) {
    if (usedRefs.has(pair.ref) || usedCands.has(pair.cand)) continue;
    usedRefs.add(pair.ref);
    usedCands.add(pair.cand);
    shared += 1;
  }
  return f1(shared, reference.length, candidate.length);
}

/**
 * Agreement between two picks on an ORDERED tier scale ("none"|"weak"|"medium"|"strong"):
 * 1 for the same tier, falling linearly with the distance between them. An unknown value
 * scores 0 — it is not a tier at all.
 */
export function ordinalAgreement(
  scale: readonly string[],
  reference: string,
  candidate: string,
): number {
  const left = scale.indexOf(reference);
  const right = scale.indexOf(candidate);
  if (left < 0 || right < 0) return 0;
  if (scale.length < 2) return 1;
  return 1 - Math.abs(left - right) / (scale.length - 1);
}

/** `count / total`, with an empty denominator scoring 1 (nothing was asked, nothing failed). */
export function ratioScore(count: number, total: number): number {
  return total === 0 ? 1 : count / total;
}

/** Mean of the given scores; an empty list scores 1 for the same reason ratioScore does. */
export function meanScore(scores: readonly number[]): number {
  if (scores.length === 0) return 1;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
