/**
 * Purpose: kNN cosine-similarity graph construction and singleton-community merging for topic
 * discovery — the graphology plumbing around Louvain. Pure, deterministic given its inputs.
 * Main exports: buildKnnGraph, mergeSingletonCommunities.
 */
import Graph from "graphology";
import { computeCentroid, cosineSimilarity } from "./topicVectors";

const K_NEAREST = 5;
const SIMILARITY_THRESHOLD = 0.35;
const MERGE_SIMILARITY_THRESHOLD = 0.3;

export function buildKnnGraph(
  embeddedIds: readonly string[],
  embeddingByNodeId: ReadonlyMap<string, readonly number[]>,
): Graph {
  const graph = new Graph({ type: "undirected" });
  for (const id of embeddedIds) graph.mergeNode(id);
  for (const id of embeddedIds) {
    const vector = embeddingByNodeId.get(id);
    if (vector === undefined) continue;
    const neighbors = embeddedIds
      .filter((otherId) => otherId !== id)
      .map((otherId) => ({
        otherId,
        similarity: cosineSimilarity(vector, embeddingByNodeId.get(otherId) ?? []),
      }))
      .filter((entry) => entry.similarity >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, K_NEAREST);
    for (const neighbor of neighbors) {
      graph.mergeEdge(id, neighbor.otherId, { weight: neighbor.similarity });
    }
  }
  return graph;
}

/** Path-compressed union-find over Louvain community keys, order-independent so merge
 * decisions never depend on iteration order. */
function createUnionFind(): {
  find: (key: string) => string;
  union: (a: string, b: string) => void;
} {
  const parentByKey = new Map<string, string>();
  function find(key: string): string {
    const parent = parentByKey.get(key) ?? key;
    if (parent === key) return key;
    const root = find(parent);
    parentByKey.set(key, root);
    return root;
  }
  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parentByKey.set(rootA, rootB);
  }
  return { find, union };
}

/** Merges every size-1 Louvain community into whichever other community's (frozen, pre-merge)
 * centroid is most cosine-similar to its sole member, if that similarity clears the threshold —
 * otherwise the singleton stays its own topic. */
export function mergeSingletonCommunities(
  initialCommunities: ReadonlyMap<string, string[]>,
  embeddingByNodeId: ReadonlyMap<string, readonly number[]>,
): Map<string, string[]> {
  const centroidByKey = new Map(
    [...initialCommunities.entries()].map(([key, memberIds]) => [
      key,
      computeCentroid(memberIds, embeddingByNodeId),
    ]),
  );
  const unionFind = createUnionFind();
  const singletons = [...initialCommunities.entries()]
    .filter(([, memberIds]) => memberIds.length === 1)
    .map(([key, memberIds]) => ({ key, nodeId: memberIds[0] as string }))
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  for (const singleton of singletons) {
    const vector = embeddingByNodeId.get(singleton.nodeId);
    if (vector === undefined) continue;
    let bestKey: string | null = null;
    let bestSimilarity = -Infinity;
    for (const [candidateKey, centroid] of centroidByKey) {
      if (candidateKey === singleton.key) continue;
      const similarity = cosineSimilarity(vector, centroid);
      const better =
        similarity > bestSimilarity ||
        (similarity === bestSimilarity && candidateKey < (bestKey ?? candidateKey));
      if (better) {
        bestSimilarity = similarity;
        bestKey = candidateKey;
      }
    }
    if (bestKey !== null && bestSimilarity >= MERGE_SIMILARITY_THRESHOLD) {
      unionFind.union(singleton.key, bestKey);
    }
  }

  const merged = new Map<string, string[]>();
  for (const [key, memberIds] of initialCommunities) {
    const root = unionFind.find(key);
    const members = merged.get(root) ?? [];
    members.push(...memberIds);
    merged.set(root, members);
  }
  return merged;
}
