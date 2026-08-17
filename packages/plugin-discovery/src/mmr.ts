/**
 * Purpose: Maximal Marginal Relevance reranking (textbook algorithm, Carbonell & Goldstein
 * 1998) with a hard per-topic quota, used to keep the discovery feed's batch diverse instead
 * of letting one high-scoring topic dominate. Pure math, no DB, no I/O.
 * Main exports: MmrCandidate, mmrSelect.
 */

export interface MmrCandidate<T> {
  item: T;
  score: number;
  /** Null when the candidate has no embedding yet (e.g. a just-generated card whose fastembed
   * pass hasn't run) — such candidates fall back to pure score ranking but still count toward
   * their topic's quota. */
  embedding: readonly number[] | null;
  topicLabel: string;
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Similarity between two candidates for the diversity penalty; missing embeddings count as
 * dissimilar (0), which is what makes embedding-less items fall back to pure score order. */
function candidateSimilarity<T>(a: MmrCandidate<T>, b: MmrCandidate<T>): number {
  if (!a.embedding || !b.embedding) return 0;
  return cosineSimilarity(a.embedding, b.embedding);
}

/** Greedy MMR selection: repeatedly picks the remaining candidate maximizing
 * `lambda * score - (1 - lambda) * maxSimilarityToAlreadySelected`, deferring any candidate
 * whose topic has already hit `perTopicCap`. Capped-out candidates are not dropped — they
 * sink to the tail in score order (a mono-topic pool must still show everything; the cap
 * shapes the TOP of the feed, it is not admission control — 2026-08-17 starvation fix). */
export function mmrSelect<T>(
  items: readonly MmrCandidate<T>[],
  k: number,
  lambda = 0.7,
  perTopicCap = 3,
): T[] {
  const remaining = [...items];
  const selected: MmrCandidate<T>[] = [];
  const deferred: MmrCandidate<T>[] = [];
  const countByTopic = new Map<string, number>();

  while (selected.length < k && remaining.length > 0) {
    let bestIndex = -1;
    let bestValue = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      if (!candidate) continue;
      const topicCount = countByTopic.get(candidate.topicLabel) ?? 0;
      if (topicCount >= perTopicCap) continue;

      const maxSimilarity =
        selected.length === 0
          ? 0
          : Math.max(...selected.map((chosen) => candidateSimilarity(candidate, chosen)));
      const value = lambda * candidate.score - (1 - lambda) * maxSimilarity;

      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) {
      // Every remaining candidate is topic-capped: they sink to the tail by score.
      deferred.push(...remaining.splice(0, remaining.length));
      break;
    }
    const [chosen] = remaining.splice(bestIndex, 1);
    if (!chosen) break;
    selected.push(chosen);
    countByTopic.set(chosen.topicLabel, (countByTopic.get(chosen.topicLabel) ?? 0) + 1);
  }

  deferred.sort((a, b) => b.score - a.score);
  const tailBudget = k - selected.length;
  return [...selected, ...deferred.slice(0, Math.max(0, tailBudget))].map((entry) => entry.item);
}
