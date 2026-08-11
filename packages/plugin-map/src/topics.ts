/**
 * Purpose: cluster the user's knowledge nodes into discovered topics (kNN cosine graph +
 * deterministic Louvain community detection), independent of tree structure — one topic
 * becomes one island. Pure: no DB, no UI, no randomness beyond the seeded rng.
 * Main exports: discoverTopics, TopicSummary, TopicAssignment.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import louvain from "graphology-communities-louvain";
import { createSeededRandom, hashStringToSeed } from "./random";
import { buildParentMap, groupByRoot, sumEngagement } from "./topicFallback";
import { buildKnnGraph, mergeSingletonCommunities } from "./topicGraph";
import { computeCentroid, cosineSimilarity } from "./topicVectors";

export interface TopicSummary {
  id: string;
  label: string;
  memberNodeIds: string[];
  weight: number;
}

export interface TopicAssignment {
  topics: TopicSummary[];
}

function findEmbeddedAncestorKey(
  nodeId: string,
  parentByNode: ReadonlyMap<string, string | null>,
  communityKeyByNodeId: ReadonlyMap<string, string>,
): string | null {
  const visited = new Set<string>();
  let current = parentByNode.get(nodeId) ?? null;
  while (current !== null && !visited.has(current)) {
    const key = communityKeyByNodeId.get(current);
    if (key !== undefined) return key;
    visited.add(current);
    current = parentByNode.get(current) ?? null;
  }
  return null;
}

function pickMedoid(
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

function orderTopics(topics: readonly TopicSummary[]): TopicSummary[] {
  return [...topics].sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
}

export function discoverTopics(
  nodes: readonly KnowledgeNodeRow[],
  embeddingByNodeId: ReadonlyMap<string, readonly number[]>,
  engagementByNodeId: ReadonlyMap<string, number>,
): TopicAssignment {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const parentByNode = buildParentMap(nodes);
  const embeddedNodes = nodes.filter((node) => (embeddingByNodeId.get(node.id)?.length ?? 0) > 0);

  if (embeddedNodes.length < 2) {
    return { topics: orderTopics(groupByRoot(nodes, parentByNode, nodesById, engagementByNodeId)) };
  }

  const embeddedIds = embeddedNodes.map((node) => node.id);
  const embeddedIdSet = new Set(embeddedIds);
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

  const mergedCommunities = mergeSingletonCommunities(initialCommunities, embeddingByNodeId);
  const communityKeyByNodeId = new Map<string, string>();
  for (const [key, memberIds] of mergedCommunities) {
    for (const id of memberIds) communityKeyByNodeId.set(id, key);
  }

  const leftoverNodes: KnowledgeNodeRow[] = [];
  for (const node of nodes) {
    if (embeddedIdSet.has(node.id)) continue;
    const key = findEmbeddedAncestorKey(node.id, parentByNode, communityKeyByNodeId);
    if (key !== null) {
      mergedCommunities.get(key)?.push(node.id);
    } else {
      leftoverNodes.push(node);
    }
  }

  const embeddedTopics: TopicSummary[] = [...mergedCommunities.values()].flatMap((memberIds) => {
    const embeddedMemberIds = memberIds.filter((id) => embeddedIdSet.has(id));
    const medoid = pickMedoid(embeddedMemberIds, embeddingByNodeId, nodesById);
    if (medoid === undefined) return [];
    return [
      {
        id: medoid.id,
        label: medoid.label,
        memberNodeIds: [...memberIds],
        weight: sumEngagement(memberIds, engagementByNodeId),
      },
    ];
  });

  const leftoverTopics = groupByRoot(leftoverNodes, parentByNode, nodesById, engagementByNodeId);
  return { topics: orderTopics([...embeddedTopics, ...leftoverTopics]) };
}
