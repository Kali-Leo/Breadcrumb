/**
 * Purpose: spec 059's bridge math — turns the learner's watched professional-content titles
 * (already embedded by the caller) into a per-knowledge-node browsing-affinity score.
 *
 * Why distribution-relative, not an absolute floor: the local e5 model packs every
 * title-node pair into a narrow high band (measured on the live database 2026-08-29:
 * node-node cosines min 0.802, p10 0.831, median 0.854, p90 0.886, max 0.949 — and titles
 * go through the same "query: " prefix, so they live in the same band). An absolute floor
 * anywhere in that band either passes everything or nothing — the same bug the 2026-08-28
 * audit rooted out of the dedup tier (病根三, see feature-knowledge-tree/similarityGate.ts).
 * So a title lends affinity only to nodes that stand out of that title's OWN similarity
 * landscape: sim ≥ mean + fraction×(best − mean), and by at least MIN_AFFINITY_EXCESS over
 * the mean, so a title related to nothing (flat landscape) crowns no node at all.
 *
 * Pure math, no DB, no I/O. Cosine and the gate come from @breadcrumb/core-vectors, shared
 * with feature-interest and feature-knowledge-tree (2026-09-02).
 * Main exports: browsingAffinityByNode, watchedTitleSignals, watchedTitleWeight,
 * WatchedTitleVector.
 */
import { cosineSimilarity, relativeGate, similarityBaseline } from "@breadcrumb/core-vectors";
import type { ProContent } from "./schemas";

/** Re-exported under this module's own name: the affinity bridge gates on the same fraction
 * as the dedup tier and feature-graph's candidate ranking, and there is only one of it. */
export { RELATIVE_GATE_FRACTION as AFFINITY_RELATIVE_GATE_FRACTION } from "@breadcrumb/core-vectors";

/** A node must exceed the title's mean similarity by at least this much, on top of the
 * relative gate. The relative gate alone always passes each title's best node, even when the
 * title resembles nothing the learner studies (a flat landscape still has a max); this floor
 * is calibrated to the measured band: the live database's p10→p90 node-node spread is ≈0.055
 * (2026-08-29), so a genuine match must clear the mean by about one band-width. */
export const MIN_AFFINITY_EXCESS = 0.05;

/** Recency half-life for a watched title's weight. A product choice, not an empirical value
 * (nothing to fit it on); 30 days says "what you watched this month speaks, last quarter's
 * viewing barely whispers". */
export const BROWSING_RECENCY_HALF_LIFE_DAYS = 30;

/** How much a finished viewing outweighs an abandoned one. Unfinished is deliberately not
 * zero — starting a video is still a choice — but it half-counts, because abandonment is
 * ambiguous between "not interested" and "too hard right now" (spec 059 决策记录). */
const UNFINISHED_WEIGHT_FACTOR = 0.5;

export interface WatchedTitleVector {
  title: string;
  /** Combined finished/recency weight in [0,1] — see watchedTitleWeight. */
  weight: number;
  vector: readonly number[];
}

// The affinity score per node: weight × (similarity − title's mean similarity), max-pooled
// over titles — "excess similarity" units, small (≲0.15) but honestly [0,1]-bounded;
// frontier min-max normalizes inside the candidate set, so only the ordering carries
// meaning. Titles themselves stop here: Leo 裁决 2026-08-30「完全找不到什么给知识点标注
// 从什么视频来的理由，请你把这个删掉」— no title ever leaves this computation.

/** Weight of one watched item: finished counts full, unfinished half, both fading on a
 * 30-day half-life from the viewing time. */
export function watchedTitleWeight(finished: boolean, ageDays: number): number {
  const base = finished ? 1 : UNFINISHED_WEIGHT_FACTOR;
  return base * 0.5 ** (Math.max(0, ageDays) / BROWSING_RECENCY_HALF_LIFE_DAYS);
}

export interface WatchedTitleSignal {
  title: string;
  weight: number;
  /** Viewing time (unix seconds) and completion of the winning entry — carried so hindsight
   * validation (spec 060 §5) can recompute this title's weight as of any past moment. */
  ts: number;
  finished: boolean;
}

/** Flattens a /pro_content response into weighted title signals for embedding. Duplicate
 * titles (finished and unfinished lists can overlap across the window) keep only their
 * strongest weight; empty titles are dropped — there is nothing to embed. */
export function watchedTitleSignals(pro: ProContent, nowMillis: number): WatchedTitleSignal[] {
  const byTitle = new Map<string, WatchedTitleSignal>();
  const fold = (items: ProContent["finished"], finished: boolean) => {
    for (const item of items) {
      if (item.title === "") continue;
      const ageDays = Math.max(0, nowMillis / 1000 - item.ts) / 86_400;
      const weight = watchedTitleWeight(finished, ageDays);
      const existing = byTitle.get(item.title);
      if (existing === undefined || weight > existing.weight) {
        byTitle.set(item.title, { title: item.title, weight, ts: item.ts, finished });
      }
    }
  };
  fold(pro.finished, true);
  fold(pro.unfinished, false);
  return [...byTitle.values()];
}

/** Per-node browsing affinity, max-pooled over titles (an average would let a hundred
 * unrelated titles dilute the one that actually matches). Only nodes that stand out of some
 * title's own similarity landscape appear in the result — see the header for why the gate
 * is relative. Fewer than two nodes yields nothing: one similarity is not a landscape. */
export function browsingAffinityByNode(
  titles: readonly WatchedTitleVector[],
  nodeVectors: ReadonlyMap<string, readonly number[]>,
): Map<string, number> {
  const result = new Map<string, number>();
  if (titles.length === 0 || nodeVectors.size < 2) return result;

  const nodeIds = [...nodeVectors.keys()];
  for (const titleVector of titles) {
    const similarities = nodeIds.map((nodeId) => {
      const nodeVector = nodeVectors.get(nodeId);
      return nodeVector === undefined ? 0 : cosineSimilarity(titleVector.vector, nodeVector);
    });
    // similarityBaseline clamps the mean to best: float rounding must not push it above.
    const baseline = similarityBaseline(similarities);
    const mean = baseline.mean;
    const gate = relativeGate(baseline);

    for (let index = 0; index < nodeIds.length; index += 1) {
      const similarity = similarities[index] ?? 0;
      const excess = similarity - mean;
      if (similarity < gate || excess < MIN_AFFINITY_EXCESS) continue;
      const nodeId = nodeIds[index];
      if (nodeId === undefined) continue;
      const score = Math.min(1, titleVector.weight * excess);
      const incumbent = result.get(nodeId);
      if (incumbent === undefined || score > incumbent) result.set(nodeId, score);
    }
  }
  return result;
}
