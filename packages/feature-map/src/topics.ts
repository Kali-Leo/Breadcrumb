/**
 * Purpose: cluster the user's knowledge nodes into discovered topics (kNN cosine graph +
 * deterministic Louvain community detection) ignoring tree structure entirely, one-member
 * groups leaving as islets. The map itself no longer shapes itself from this — spec 031
 * made it tree-first (./continents.ts) — but TopicSummary is still the islet's shape and
 * this whole-corpus view stays available. Pure: no DB, no UI, seeded randomness only.
 * Main exports: discoverTopics, TopicSummary, TopicAssignment.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { compareCodePoints } from "./ordering";
import { clusterEmbeddedNodes, pickMedoid } from "./topicCluster";
import { buildParentMap, groupByRoot, sumEngagement } from "./topicFallback";

export interface TopicSummary {
  id: string;
  label: string;
  memberNodeIds: string[];
  weight: number;
}

export interface TopicAssignment {
  topics: TopicSummary[];
  /**
   * Interests that ended up alone — exactly one member node, nothing else clustered with it.
   * They are not topics yet, so the map draws them as unnamed islets instead of continents.
   */
  islets: TopicSummary[];
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

function orderTopics(topics: readonly TopicSummary[]): TopicSummary[] {
  return [...topics].sort((a, b) => b.weight - a.weight || compareCodePoints(a.label, b.label));
}

/** A one-member group is a single touch, not a topic — it leaves the continents and becomes
 * an unnamed islet. Multi-member groups are untouched. */
function splitIslets(summaries: readonly TopicSummary[]): TopicAssignment {
  const topics: TopicSummary[] = [];
  const islets: TopicSummary[] = [];
  for (const summary of summaries) {
    if (summary.memberNodeIds.length === 1) islets.push(summary);
    else topics.push(summary);
  }
  return { topics: orderTopics(topics), islets: orderTopics(islets) };
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
    return splitIslets(groupByRoot(nodes, parentByNode, nodesById, engagementByNodeId));
  }

  const embeddedIds = embeddedNodes.map((node) => node.id);
  const embeddedIdSet = new Set(embeddedIds);
  const mergedCommunities = clusterEmbeddedNodes(embeddedIds, embeddingByNodeId);
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
  return splitIslets([...embeddedTopics, ...leftoverTopics]);
}
