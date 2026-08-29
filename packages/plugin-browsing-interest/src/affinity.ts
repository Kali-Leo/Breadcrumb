/**
 * Purpose: spec 059's bridge math — turns the learner's watched professional-content titles
 * (already embedded by the caller) into a per-knowledge-node browsing-affinity score.
 *
 * Why distribution-relative, not an absolute floor: the local e5 model packs every
 * title-node pair into a narrow high band (measured on the live database 2026-08-29:
 * node-node cosines min 0.802, p10 0.831, median 0.854, p90 0.886, max 0.949 — and titles
 * go through the same "query: " prefix, so they live in the same band). An absolute floor
 * anywhere in that band either passes everything or nothing — the same bug the 2026-08-28
 * audit rooted out of the dedup tier (病根三, see plugin-knowledge-tree/similarityGate.ts).
 * So a title lends affinity only to nodes that stand out of that title's OWN similarity
 * landscape: sim ≥ mean + fraction×(best − mean), and by at least MIN_AFFINITY_EXCESS over
 * the mean, so a title related to nothing (flat landscape) crowns no node at all.
 *
 * Pure math, no DB, no I/O. Local cosine helper per 行为局部性 > DRY (mirrors
 * plugin-interest/spread.ts and plugin-knowledge-tree/similarityGate.ts).
 * Main exports: browsingAffinityByNode, watchedTitleSignals, watchedTitleWeight,
 * WatchedTitleVector, BrowsingNodeAffinity.
 */
import type { ProContent } from "./schemas";

/** Same constant, same meaning as similarityGate.ts / plugin-graph's RELATIVE_GATE. */
export const AFFINITY_RELATIVE_GATE_FRACTION = 0.5;

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

export interface BrowsingNodeAffinity {
  /** weight × (similarity − title's mean similarity), max-pooled over titles — "excess
   * similarity" units, small (≲0.15) but honestly [0,1]-bounded; frontier min-max
   * normalizes inside the candidate set, so only the ordering carries meaning. */
  score: number;
  /** The title behind the max — surfaced in the UI as "最近看过：…" so the learner can see
   * (and judge) why this node got a browsing nudge. Never sent to any LLM. */
  sourceTitle: string;
}

/** Weight of one watched item: finished counts full, unfinished half, both fading on a
 * 30-day half-life from the viewing time. */
export function watchedTitleWeight(finished: boolean, ageDays: number): number {
  const base = finished ? 1 : UNFINISHED_WEIGHT_FACTOR;
  return base * 0.5 ** (Math.max(0, ageDays) / BROWSING_RECENCY_HALF_LIFE_DAYS);
}

export interface WatchedTitleSignal {
  title: string;
  weight: number;
}

/** Flattens a /pro_content response into weighted title signals for embedding. Duplicate
 * titles (finished and unfinished lists can overlap across the window) keep only their
 * strongest weight; empty titles are dropped — there is nothing to embed. */
export function watchedTitleSignals(pro: ProContent, nowMillis: number): WatchedTitleSignal[] {
  const weightByTitle = new Map<string, number>();
  const fold = (items: ProContent["finished"], finished: boolean) => {
    for (const item of items) {
      if (item.title === "") continue;
      const ageDays = Math.max(0, nowMillis / 1000 - item.ts) / 86_400;
      const weight = watchedTitleWeight(finished, ageDays);
      const existing = weightByTitle.get(item.title);
      if (existing === undefined || weight > existing) weightByTitle.set(item.title, weight);
    }
  };
  fold(pro.finished, true);
  fold(pro.unfinished, false);
  return [...weightByTitle.entries()].map(([title, weight]) => ({ title, weight }));
}

/** Per-node browsing affinity, max-pooled over titles (an average would let a hundred
 * unrelated titles dilute the one that actually matches). Only nodes that stand out of some
 * title's own similarity landscape appear in the result — see the header for why the gate
 * is relative. Fewer than two nodes yields nothing: one similarity is not a landscape. */
export function browsingAffinityByNode(
  titles: readonly WatchedTitleVector[],
  nodeVectors: ReadonlyMap<string, readonly number[]>,
): Map<string, BrowsingNodeAffinity> {
  const result = new Map<string, BrowsingNodeAffinity>();
  if (titles.length === 0 || nodeVectors.size < 2) return result;

  const nodeIds = [...nodeVectors.keys()];
  for (const titleVector of titles) {
    const similarities = nodeIds.map((nodeId) => {
      const nodeVector = nodeVectors.get(nodeId);
      return nodeVector === undefined ? 0 : cosineSimilarity(titleVector.vector, nodeVector);
    });
    let sum = 0;
    let best = 0;
    for (const similarity of similarities) {
      sum += similarity;
      best = Math.max(best, similarity);
    }
    // Clamped like similarityGate.ts: float rounding must not push mean above best.
    const mean = Math.min(sum / similarities.length, best);
    const gate = mean + AFFINITY_RELATIVE_GATE_FRACTION * (best - mean);

    for (let index = 0; index < nodeIds.length; index += 1) {
      const similarity = similarities[index] ?? 0;
      const excess = similarity - mean;
      if (similarity < gate || excess < MIN_AFFINITY_EXCESS) continue;
      const nodeId = nodeIds[index];
      if (nodeId === undefined) continue;
      const score = Math.min(1, titleVector.weight * excess);
      const incumbent = result.get(nodeId);
      if (incumbent === undefined || score > incumbent.score) {
        result.set(nodeId, { score, sourceTitle: titleVector.title });
      }
    }
  }
  return result;
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    const valueA = a[index] ?? 0;
    const valueB = b[index] ?? 0;
    dotProduct += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
