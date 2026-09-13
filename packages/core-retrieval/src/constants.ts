/**
 * Purpose: the four numbers the retrieval pipeline is shaped by, each with the measurement it
 * came from, in one place so that changing one is a decision rather than an edit.
 * Main exports: ROUTE_DEPTH, KEYWORD_WEIGHT, VECTOR_WEIGHT, RERANK_DEPTH, DEFAULT_TOP_K.
 */

/** How deep each route is asked to go before fusion. Deeper than anything downstream reads,
 * because fusion can only reorder what it was given, and the keyword route's value is
 * precisely the passages the vector route never returned. */
export const ROUTE_DEPTH = 100;

/** See rrf.ts: equal weight measurably makes fusion worse than the vector route alone. */
export const KEYWORD_WEIGHT = 1;
export const VECTOR_WEIGHT = 3;

/**
 * How many candidates a reranker sees. Fifty, and the ablation is unusually clear about why
 * (docs/research/2026-09-12-检索与重排-大规模实测.md §6.4): reranking only the top 8 leaves
 * Recall@8 *bit-identical* to not reranking at all — by definition, since reordering eight
 * passages cannot change which eight they are — and buys 0.09 nDCG@10. Depth 20 gets about
 * seven-tenths of the benefit (0.666), depth 50 gets all of it (0.750). The candidate pool has
 * to be far deeper than the number of passages actually read, or the second stage has nothing
 * to rescue.
 *
 * Whether 20 would have done was measured separately and the answer is no
 * (docs/research/2026-09-13-重排深度与追问改写-实测.md). Time is linear in depth and quality is
 * concave in it, so every step down looks like a bargain and none of them is: 30 costs 8% of
 * Chinese-and-English nDCG@10, 20 costs 12% (and 16% of R@8), 10 costs 22%. There is no
 * cheap middle to find. Fifty.
 */
export const RERANK_DEPTH = 50;

/** Passages handed to the generation layer when the caller does not say. Eight is what R@8 in
 * every table of the research refers to, so this is the number those numbers describe. */
export const DEFAULT_TOP_K = 8;
