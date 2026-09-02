/**
 * Purpose: the shared embedding-clustering core — seeded Louvain over the relative-gate kNN
 * graph, singleton merging, and medoid naming — used by both legacy topic discovery
 * (./topics.ts) and tree-first continent derivation (./continents.ts).
 * Main exports: clusterEmbeddedNodes, pickMedoid. Pure: no DB, no UI, seeded randomness only.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import louvain from "graphology-communities-louvain";
import { createSeededRandom, hashStringToSeed } from "./random";
import { buildKnnGraph, mergeSingletonCommunities } from "./topicGraph";
import { computeCentroid, cosineSimilarity } from "./topicVectors";

/**
 * Groups the given embedded node ids into communities keyed by Louvain community key.
 * Callers must pass only ids that actually carry an embedding — similarity cannot be judged
 * without one. Fewer than two ids can form no edge, so nothing clusters and the map is empty.
 */
export function clusterEmbeddedNodes(
  embeddedIds: readonly string[],
  embeddingByNodeId: ReadonlyMap<string, readonly number[]>,
): Map<string, string[]> {
  if (embeddedIds.length < 2) return new Map();
  const graph = buildKnnGraph(embeddedIds, embeddingByNodeId);
  const rng = createSeededRandom(hashStringToSeed([...embeddedIds].sort().join(",")));
  const communityIndexByNode = louvain(graph, { rng, getEdgeWeight: "weight" });

  const initialCommunities = new Map<string, string[]>();
  for (const id of embeddedIds) {
    const key = String(communityIndexByNode[id]);
    const members = initialCommunities.get(key) ?? [];
    members.push(id);
    initialCommunities.set(key, members);
  }
  return mergeSingletonCommunities(initialCommunities, embeddingByNodeId, graph);
}

/** The member whose vector sits closest to the group's centroid — the honest stand-in name
 * for a group nobody has named yet. Ties break by creation order, then id, so it is stable. */
export function pickMedoid(
  embeddedMemberIds: readonly string[],
  embeddingByNodeId: ReadonlyMap<string, readonly number[]>,
  nodesById: ReadonlyMap<string, KnowledgeNodeRow>,
): KnowledgeNodeRow | undefined {
  const centroid = computeCentroid(embeddedMemberIds, embeddingByNodeId);
  let best: KnowledgeNodeRow | undefined;
  let bestSimilarity = -Infinity;
  for (const id of embeddedMemberIds) {
    const vector = embeddingByNodeId.get(id);
    const node = nodesById.get(id);
    if (vector === undefined || node === undefined) continue;
    const similarity = cosineSimilarity(vector, centroid);
    const better =
      best === undefined ||
      similarity > bestSimilarity ||
      (similarity === bestSimilarity &&
        (node.created_at < best.created_at ||
          (node.created_at === best.created_at && node.id < best.id)));
    if (better) {
      best = node;
      bestSimilarity = similarity;
    }
  }
  return best;
}
