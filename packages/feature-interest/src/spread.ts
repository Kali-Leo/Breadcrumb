/**
 * Purpose: embedding-similarity neighborhood diffusion — a node with no direct interest
 * signal but close (by cosine similarity) to interested nodes inherits some of that
 * interest. Pure math, no DB, no I/O. The all-pairs sweep behind it lives in
 * spreadNeighbors.ts. Cosine itself comes from @breadcrumb/core-vectors, the single source of
 * truth for it — this module must not keep a private copy.
 * Main exports: spreadInterest, DEFAULT_SPREAD_FACTOR, SPREAD_SIMILARITY_FLOOR,
 * SPREAD_NEIGHBOR_TOP_K.
 */
import type { NodeEmbeddingRow } from "@breadcrumb/core-db";
import { parseVectorRows } from "@breadcrumb/core-db";
import { clampUnit } from "@breadcrumb/feature-memory";
import { type NeighborSlots, topNeighbors } from "./spreadNeighbors";

/** How much of the similarity-weighted neighborhood average bleeds into a node's own
 * score; 0 = no diffusion, 1 = a node with no signal fully inherits its neighbors'. */
export const DEFAULT_SPREAD_FACTOR = 0.3;

/** A neighbor below this cosine similarity is not a neighbor. Without a floor, every node in
 * the tree joins every other node's weighted average, so diffusion degenerates into adding a
 * global mean interest to everything and loses the locality that is its whole point. */
export const SPREAD_SIMILARITY_FLOOR = 0.5;

/** However many neighbors clear the floor, only the closest this many diffuse — the same
 * absolute cost ceiling feature-graph's DEFAULT_TOP_K_SIMILAR (= 8) puts on its own candidate
 * pool, for the same reason: it bounds the worst case (a node sitting in a dense cluster of
 * near-equal matches) without being the primary cutoff. */
export const SPREAD_NEIGHBOR_TOP_K = 8;

/**
 * Diffuses per-node scores (e.g. curiosity) across the embedding neighborhood. Diffusion only
 * ever fills the gap toward the neighborhood average — it never lowers a node's own score.
 *
 * Every node the caller scored comes back, embedded or not. A node without an embedding row
 * has no neighborhood, so it passes through carrying its own score unchanged — it is not a
 * node with no interest. This matters because embeddings are backfilled asynchronously, so
 * the nodes missing a row are the ones that appeared most recently, i.e. whatever the learner
 * just got curious about; treating "no embedding" as "no interest" would silently zero exactly
 * the wrong nodes, and zero the entire tree whenever the local embedding model had not been
 * downloaded, with the interest slider still showing full tilt.
 */
export function spreadInterest(
  scoresByNodeId: ReadonlyMap<string, number>,
  embeddings: readonly NodeEmbeddingRow[],
  factor: number,
): Map<string, number> {
  const vectorByNodeId = parseVectorRows(embeddings, (row) => row.node_id);
  const result = new Map<string, number>();
  for (const [nodeId, own] of scoresByNodeId) result.set(nodeId, clampUnit(own));

  const slots = topNeighbors(
    [...vectorByNodeId].map(([id, vector]) => ({ id, vector })),
    SPREAD_NEIGHBOR_TOP_K,
    SPREAD_SIMILARITY_FLOOR,
  );
  slots.packed.ids.forEach((nodeId, row) => {
    const own = clampUnit(scoresByNodeId.get(nodeId) ?? 0);
    const neighborAverage = weightedNeighborAverage(slots, row, scoresByNodeId);
    result.set(nodeId, clampUnit(own + factor * neighborAverage * (1 - own)));
  });
  return result;
}

/** Similarity-weighted mean of one row's kept neighbors' scores; 0 when it kept none. */
function weightedNeighborAverage(
  slots: NeighborSlots,
  row: number,
  scoresByNodeId: ReadonlyMap<string, number>,
): number {
  const base = row * slots.capacity;
  let weightedSum = 0;
  let weightTotal = 0;
  for (let index = 0; index < (slots.count[row] ?? 0); index += 1) {
    const similarity = slots.similarity[base + index] ?? 0;
    const neighborId = slots.packed.ids[slots.partner[base + index] ?? 0] ?? "";
    weightedSum += similarity * clampUnit(scoresByNodeId.get(neighborId) ?? 0);
    weightTotal += similarity;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}
