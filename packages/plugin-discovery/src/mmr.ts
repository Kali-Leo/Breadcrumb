/**
 * Purpose: Maximal Marginal Relevance reranking (textbook algorithm, Carbonell & Goldstein
 * 1998) under the topic / source channel / content form quotas that keep the discovery feed's
 * batch diverse instead of letting one topic, one platform or one content form dominate (spec 053
 * §4's 跨渠道与内容形态双配额). The counters themselves live in quotaLedger.ts, so one page of the
 * feed can be assembled out of two lanes — familiar and unexplored — under a single set of caps
 * (feedPages.ts). Pure math, no DB, no I/O.
 * Main exports: MmrCandidate, MmrSelectOptions, defaultMmrOptions, selectWithQuotas, mmrSelect.
 */
import { createQuotaLedger, type QuotaLedger } from "./quotaLedger";

export type { QuotaLedger } from "./quotaLedger";
export { createQuotaLedger } from "./quotaLedger";

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
 * five from any one platform, ten of any one content form. The caps shape the page the reader is
 * actually looking at; whatever they hold back is the next page's candidate. */
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

export interface QuotaSelection<T> {
  selected: MmrCandidate<T>[];
  /** Everything not selected, best score first — the next page's candidates. */
  deferred: MmrCandidate<T>[];
}

/**
 * Greedy MMR selection under a ledger: repeatedly picks the remaining candidate maximizing
 * `lambda * score - (1 - lambda) * maxSimilarityToAlreadySelected`, skipping any candidate that
 * has hit a quota on any of its three dimensions. Stops at `k` or when every candidate left is
 * capped out — nothing is padded and nothing is dropped; what it did not take comes back as
 * `deferred` for the next page to consider.
 */
export function selectWithQuotas<T>(
  items: readonly MmrCandidate<T>[],
  k: number,
  ledger: QuotaLedger,
  lambda: number = defaultMmrOptions.lambda,
): QuotaSelection<T> {
  const remaining = [...items];
  const selected: MmrCandidate<T>[] = [];

  while (selected.length < k && remaining.length > 0) {
    let bestIndex = -1;
    let bestValue = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      if (!candidate || !ledger.isFree(candidate)) continue;
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

    if (bestIndex === -1) break; // every candidate left has hit a quota
    const [chosen] = remaining.splice(bestIndex, 1);
    if (!chosen) break;
    selected.push(chosen);
    ledger.take(chosen);
  }

  return { selected, deferred: remaining.sort((a, b) => b.score - a.score) };
}

/**
 * One list of `k` items under a fresh set of caps. Candidates the caps hold back are not dropped:
 * once every one of them is capped out they fill the tail in score order, because a mono-topic
 * pool must still show everything it has (the caps shape the page, they are not admission
 * control — 2026-08-17 starvation fix).
 */
export function mmrSelect<T>(
  items: readonly MmrCandidate<T>[],
  k: number,
  options: MmrSelectOptions = {},
): T[] {
  const lambda = options.lambda ?? defaultMmrOptions.lambda;
  const { selected, deferred } = selectWithQuotas(items, k, createQuotaLedger(options), lambda);
  const tailBudget = Math.max(0, k - selected.length);
  return [...selected, ...deferred.slice(0, tailBudget)].map((entry) => entry.item);
}
