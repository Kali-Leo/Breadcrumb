/**
 * Purpose: Maximal Marginal Relevance reranking (textbook algorithm, Carbonell & Goldstein
 * 1998) with hard quotas on topic, source channel and content form, used to keep the discovery
 * feed's batch diverse instead of letting one topic, one platform or one content form dominate
 * (spec 053 §4's 跨渠道与内容形态双配额). Pure math, no DB, no I/O.
 * Main exports: MmrCandidate, MmrSelectOptions, defaultMmrOptions, mmrSelect.
 */

export interface MmrCandidate<T> {
  item: T;
  score: number;
  /** Null when the candidate has no embedding yet (a just-landed card the background embedding
   * pass hasn't reached) — such candidates fall back to pure score ranking but still count
   * toward their quotas. */
  embedding: readonly number[] | null;
  topicLabel: string;
  /** The channel the item came from. Null for items that belong to no channel. */
  sourceId?: string | null;
  /** article, video, podcast, discussion, paper. Null when the item has no form of its own. */
  contentKind?: string | null;
}

export interface MmrSelectOptions {
  /** Relevance-versus-diversity balance: 1 is pure score, 0 is pure novelty. */
  lambda?: number;
  perTopicCap?: number;
  perSourceCap?: number;
  perKindCap?: number;
}

/** Sized for one page of the feed (about two dozen cards): at most three cards on one topic,
 * five from any one platform, ten of any one content form. The caps shape the head of the list;
 * whatever they hold back sinks to the tail and comes up on a later page. */
export const defaultMmrOptions: Required<MmrSelectOptions> = {
  lambda: 0.7,
  perTopicCap: 3,
  perSourceCap: 5,
  perKindCap: 10,
};

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

/** The three quota dimensions of one candidate. A null dimension is exempt: an item with no
 * channel cannot crowd out a channel. */
function quotaKeys<T>(candidate: MmrCandidate<T>): { dimension: string; key: string }[] {
  const keys = [{ dimension: "topic", key: candidate.topicLabel }];
  if (candidate.sourceId) keys.push({ dimension: "source", key: candidate.sourceId });
  if (candidate.contentKind) keys.push({ dimension: "kind", key: candidate.contentKind });
  return keys;
}

function capFor(dimension: string, options: Required<MmrSelectOptions>): number {
  if (dimension === "source") return options.perSourceCap;
  if (dimension === "kind") return options.perKindCap;
  return options.perTopicCap;
}

/**
 * Greedy MMR selection: repeatedly picks the remaining candidate maximizing
 * `lambda * score - (1 - lambda) * maxSimilarityToAlreadySelected`, deferring any candidate
 * that has hit a quota on any of its three dimensions. Capped-out candidates are not dropped —
 * they sink to the tail in score order (a mono-topic pool must still show everything; the caps
 * shape the TOP of the feed, they are not admission control — 2026-08-17 starvation fix).
 */
export function mmrSelect<T>(
  items: readonly MmrCandidate<T>[],
  k: number,
  options: MmrSelectOptions = {},
): T[] {
  const settings: Required<MmrSelectOptions> = { ...defaultMmrOptions, ...options };
  const remaining = [...items];
  const selected: MmrCandidate<T>[] = [];
  const deferred: MmrCandidate<T>[] = [];
  const counts = new Map<string, number>();

  const isQuotaFree = (candidate: MmrCandidate<T>): boolean =>
    quotaKeys(candidate).every(
      ({ dimension, key }) =>
        (counts.get(`${dimension}:${key}`) ?? 0) < capFor(dimension, settings),
    );

  while (selected.length < k && remaining.length > 0) {
    let bestIndex = -1;
    let bestValue = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      if (!candidate || !isQuotaFree(candidate)) continue;

      const maxSimilarity =
        selected.length === 0
          ? 0
          : Math.max(...selected.map((chosen) => candidateSimilarity(candidate, chosen)));
      const value = settings.lambda * candidate.score - (1 - settings.lambda) * maxSimilarity;

      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) {
      // Every remaining candidate has hit a quota: they sink to the tail by score.
      deferred.push(...remaining.splice(0, remaining.length));
      break;
    }
    const [chosen] = remaining.splice(bestIndex, 1);
    if (!chosen) break;
    selected.push(chosen);
    for (const { dimension, key } of quotaKeys(chosen)) {
      const countKey = `${dimension}:${key}`;
      counts.set(countKey, (counts.get(countKey) ?? 0) + 1);
    }
  }

  deferred.sort((a, b) => b.score - a.score);
  const tailBudget = k - selected.length;
  return [...selected, ...deferred.slice(0, Math.max(0, tailBudget))].map((entry) => entry.item);
}
