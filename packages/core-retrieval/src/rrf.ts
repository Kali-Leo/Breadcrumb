/**
 * Purpose: reciprocal-rank fusion — how a keyword ranking and a vector ranking become one
 * ranking without either of them having to produce comparable scores.
 *
 * RRF adds 1/(k + rank) across the lists a document appears in. It uses only positions, which
 * is the point: BM25 returns a negative log-odds and a cosine returns a number between −1 and
 * 1, and there is no honest way to add those. k = 60 is the constant from Cormack et al. and
 * the one the measurements were run with; it flattens the top of each list so that being
 * third on both lists beats being first on one.
 *
 * The weights are not decoration. Measured across ten languages and 76M passages
 * (docs/research/2026-09-12-检索与重排-大规模实测.md §0.1), equal-weight fusion of these two
 * routes scored 0.447 macro nDCG@10 against 0.619 for the vector route alone — fusing a strong
 * route with a weak one at equal weight makes it worse, every language, no exception. Tripling
 * the vector route's weight recovers most of that (0.539) and keeps what fusion is actually
 * for here: the keyword route drags in passages the vector route missed entirely, which is
 * worth real recall at depth (R@20 0.827 vs 0.838, and ahead on four of ten languages) and
 * is most of the reason a colloquial question still finds its answer (§7.4).
 * Main exports: fuseRrf, RankedRoute, FusedHit.
 */

/** One route's answer: ids in its own order, best first, with how much this route is trusted. */
export interface RankedRoute {
  ids: readonly string[];
  weight: number;
}

export interface FusedHit {
  id: string;
  score: number;
}

/** The rank-flattening constant. Not tuned by us — it is the published default, and it is what
 * every number in the retrieval measurements was produced with. */
export const RRF_K = 60;

/**
 * Fuses the routes. Ties are broken by first appearance, scanning routes in the order given,
 * so the result is deterministic — two passages that genuinely tie would otherwise reorder
 * between runs and make every downstream measurement noisy.
 */
export function fuseRrf(routes: readonly RankedRoute[], k: number = RRF_K): FusedHit[] {
  const scores = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let order = 0;
  for (const route of routes) {
    route.ids.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + route.weight / (k + index + 1));
      if (!firstSeen.has(id)) {
        firstSeen.set(id, order);
        order += 1;
      }
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || (firstSeen.get(a.id) ?? 0) - (firstSeen.get(b.id) ?? 0));
}
