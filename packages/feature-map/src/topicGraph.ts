/**
 * Purpose: kNN cosine-similarity graph construction and singleton-community merging for topic
 * discovery — the graphology plumbing around Louvain. Gates are RELATIVE to each node's own
 * similarity baseline (core-vectors' relativeGate, the same one the dedup tier and the edge
 * judge use): e5-family embeddings squeeze all cosines into a narrow high band
 * (observed 0.77–0.95), so absolute thresholds pass everything and flat-profile isolates
 * (e.g. a lone humanities note) get lumped into the nearest big cluster.
 * Main exports: buildKnnGraph, mergeSingletonCommunities.
 */
import type { SimilarityBaseline } from "@breadcrumb/core-vectors";
import {
  packVectors,
  partnersOf,
  relativeGate,
  similarityLandscape,
} from "@breadcrumb/core-vectors";
import Graph from "graphology";
import { compareCodePoints } from "./ordering";
import { computeCentroid, cosineSimilarity } from "./topicVectors";

const K_NEAREST = 5;

export function buildKnnGraph(
  embeddedIds: readonly string[],
  embeddingByNodeId: ReadonlyMap<string, readonly number[]>,
): Graph {
  const graph = new Graph({ type: "undirected" });
  for (const id of embeddedIds) graph.mergeNode(id);
  // One packed pass for the whole landscape (see @breadcrumb/core-vectors): every baseline
  // below reads from it instead of walking every other vector again per node.
  const packed = packVectors(
    embeddedIds.map((id) => ({ id, vector: embeddingByNodeId.get(id) ?? [] })),
  );
  const rowById = new Map(packed.ids.map((id, row) => [id, row]));
  const landscape = similarityLandscape(packed);
  const baselines = new Map<string, SimilarityBaseline>(
    packed.ids.map((id, row) => [id, landscape[row] ?? { mean: 0, best: 0 }]),
  );
  // The room's average closeness: an isolate is a node whose very best match sits below it.
  let baselineSum = 0;
  for (const baseline of baselines.values()) baselineSum += baseline.mean;
  const globalMean = baselines.size === 0 ? 0 : baselineSum / baselines.size;
  const isIsolate = (baseline: SimilarityBaseline): boolean => baseline.best < globalMean;
  for (const id of embeddedIds) {
    const row = rowById.get(id);
    const baseline = baselines.get(id);
    if (row === undefined || baseline === undefined) continue;
    if (isIsolate(baseline)) continue;
    const neighbors = partnersOf(packed, row)
      .map((partner) => ({ otherId: partner.id, similarity: partner.similarity }))
      .filter((entry) => {
        const otherBaseline = baselines.get(entry.otherId);
        if (otherBaseline === undefined || isIsolate(otherBaseline)) return false;
        // Above the room's average AND significant for BOTH sides — a cluster's core
        // never adopts a drifter, and degenerate tiny inputs can't fake an edge at 0.
        return (
          entry.similarity > globalMean &&
          entry.similarity >= relativeGate(baseline) &&
          entry.similarity >= relativeGate(otherBaseline)
        );
      })
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
  graph: Graph,
): Map<string, string[]> {
  const communityKeyByNode = new Map<string, string>();
  for (const [key, memberIds] of initialCommunities) {
    for (const memberId of memberIds) communityKeyByNode.set(memberId, key);
  }
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
    .sort((a, b) => compareCodePoints(a.nodeId, b.nodeId));

  for (const singleton of singletons) {
    const vector = embeddingByNodeId.get(singleton.nodeId);
    if (vector === undefined) continue;
    // A singleton may only join a community it holds a RETAINED kNN edge into — the
    // relative gate already judged that affinity real. No edge, no adoption: it becomes
    // an unnamed islet instead of ballast in the nearest big cluster.
    const linkedKeys = new Set<string>();
    if (graph.hasNode(singleton.nodeId)) {
      graph.forEachNeighbor(singleton.nodeId, (neighborId: string) => {
        const key = communityKeyByNode.get(neighborId);
        if (key !== undefined && key !== singleton.key) linkedKeys.add(key);
      });
    }
    if (linkedKeys.size === 0) continue;
    let bestKey: string | null = null;
    let bestSimilarity = -Infinity;
    for (const candidateKey of linkedKeys) {
      const centroid = centroidByKey.get(candidateKey);
      if (centroid === undefined) continue;
      const similarity = cosineSimilarity(vector, centroid);
      const better =
        similarity > bestSimilarity ||
        (similarity === bestSimilarity && candidateKey < (bestKey ?? candidateKey));
      if (better) {
        bestSimilarity = similarity;
        bestKey = candidateKey;
      }
    }
    if (bestKey !== null) {
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
