/**
 * Purpose: how many candidates the reranker reads this turn, decided by how long the reader
 * will wait rather than by a fixed number.
 *
 * The cross-encoder's cost is linear in candidates — 113–117 ms a pair on a laptop CPU at
 * 256 tokens, and two to three times that on the 512-token parent blocks this product
 * actually sends (docs/research/2026-09-13-重排深度与追问改写-实测.md §1.2). Fifty of those is
 * five to fourteen seconds in front of the first answer of every new subject, all of it
 * spent behind one line that says "searching sources". Its value is concave: on a personal
 * library of a few thousand passages the fused top-20 already holds nearly every relevant
 * one, so reading 30 more re-orders passages that were not going to be shown anyway (the
 * small-library ablation in docs/research/2026-09-15-资料相关度阈值与重排预算-实测.md).
 *
 * So the depth is a budget. The clock records what each call cost per pair and the next call
 * reads as many pairs as fit in RERANK_BUDGET_MS, never fewer than RERANK_MIN_DEPTH — at that
 * floor the reranker is still worth running, because its scores are also what the relevance
 * gate reads — and never more than RERANK_DEPTH. Before the first measurement it reads
 * RERANK_FIRST_DEPTH, a middle guess that costs about the budget on a slow machine.
 * Main exports: createRerankClock, RerankClock, rerankDepthFor, RERANK_BUDGET_MS,
 * RERANK_MIN_DEPTH, RERANK_FIRST_DEPTH.
 */
import { RERANK_DEPTH } from "./constants";

/** How long one rerank may take. Two seconds sits inside the wait the learner is already
 * accepting for the network sources, so the reranker stops being the thing they wait for. */
export const RERANK_BUDGET_MS = 2000;

/** The pool is never cut below what is shown: eight scores for eight passages is the least
 * the gate needs to say which of them are actually about the question. */
export const RERANK_MIN_DEPTH = 8;

/** The first call on a machine has no measurement to go on. Ten pairs is one to three
 * seconds across the 100–300 ms a parent block measured per pair on the desktop, and on a
 * small library it already holds most of the gain (nDCG@10 0.890 against 0.904 at fifty). */
export const RERANK_FIRST_DEPTH = 10;

/** Smoothing for the per-pair estimate. Heavy on the newest call: a session has few calls,
 * and the first ones are the ones that matter. */
const NEWEST_WEIGHT = 0.5;

export interface RerankClock {
  /** The depth the next call should read. */
  depth(): number;
  /** What the last call cost. Calls that read nothing teach nothing. */
  record(pairs: number, elapsedMs: number): void;
  /** The current estimate, or null before the first measurement. */
  msPerPair(): number | null;
}

export interface RerankClockOptions {
  budgetMs?: number;
  /** A measurement carried over from an earlier session, so the first call of this one does
   * not have to guess. Ignored unless it is a positive number. */
  initialMsPerPair?: number | null;
  /** Told each new estimate, for the caller to carry over to the next session. */
  onEstimate?(msPerPair: number): void;
}

/** The depth that fits the budget at this speed, clamped to what is worth reading. */
export function rerankDepthFor(
  msPerPair: number | null,
  budgetMs: number = RERANK_BUDGET_MS,
): number {
  if (msPerPair === null) return RERANK_FIRST_DEPTH;
  if (msPerPair <= 0) return RERANK_DEPTH;
  const fits = Math.floor(budgetMs / msPerPair);
  return Math.max(RERANK_MIN_DEPTH, Math.min(RERANK_DEPTH, fits));
}

export function createRerankClock(options: RerankClockOptions = {}): RerankClock {
  const budgetMs = options.budgetMs ?? RERANK_BUDGET_MS;
  const initial = options.initialMsPerPair;
  let estimate: number | null =
    typeof initial === "number" && Number.isFinite(initial) && initial > 0 ? initial : null;
  return {
    depth: () => rerankDepthFor(estimate, budgetMs),
    record(pairs, elapsedMs) {
      if (pairs < 1 || elapsedMs < 0) return;
      const measured = elapsedMs / pairs;
      estimate =
        estimate === null ? measured : NEWEST_WEIGHT * measured + (1 - NEWEST_WEIGHT) * estimate;
      options.onEstimate?.(estimate);
    },
    msPerPair: () => estimate,
  };
}
