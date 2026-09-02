/**
 * Purpose: tree-root grouping used when embeddings are unavailable — either globally (too few
 * embedded nodes to cluster) or locally (a no-embedding node with no embedded ancestor). Mirrors
 * shapeTree's root-resolution semantics (dangling parent degrades to root) without depending on it.
 * Main exports: buildParentMap, rootIdOf, sumEngagement, groupByRoot.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { TopicSummary } from "./topics";

export function buildParentMap(nodes: readonly KnowledgeNodeRow[]): Map<string, string | null> {
  const knownIds = new Set(nodes.map((node) => node.id));
  const parentByNode = new Map<string, string | null>();
  for (const node of nodes) {
    const parentKey =
      node.parent_id !== null && knownIds.has(node.parent_id) ? node.parent_id : null;
    parentByNode.set(node.id, parentKey);
  }
  return parentByNode;
}

export function rootIdOf(nodeId: string, parentByNode: ReadonlyMap<string, string | null>): string {
  const visited = new Set<string>();
  let current = nodeId;
  while (!visited.has(current)) {
    visited.add(current);
    const parent = parentByNode.get(current);
    if (parent === null || parent === undefined) return current;
    current = parent;
  }
  return current;
}

export function sumEngagement(
  memberIds: readonly string[],
  engagementByNodeId: ReadonlyMap<string, number>,
): number {
  return memberIds.reduce((sum, id) => sum + (engagementByNodeId.get(id) ?? 1), 0);
}

/** Groups the given nodes by their tree root — used for the too-few-embeddings fallback
 * and for no-embedding nodes stranded without any embedded ancestor. */
export function groupByRoot(
  memberNodes: readonly KnowledgeNodeRow[],
  parentByNode: ReadonlyMap<string, string | null>,
  nodesById: ReadonlyMap<string, KnowledgeNodeRow>,
  engagementByNodeId: ReadonlyMap<string, number>,
): TopicSummary[] {
  const membersByRoot = new Map<string, string[]>();
  for (const node of memberNodes) {
    const root = rootIdOf(node.id, parentByNode);
    const members = membersByRoot.get(root) ?? [];
    members.push(node.id);
    membersByRoot.set(root, members);
  }
  return [...membersByRoot.entries()].map(([rootId, memberIds]) => ({
    id: rootId,
    label: nodesById.get(rootId)?.label ?? rootId,
    memberNodeIds: memberIds,
    weight: sumEngagement(memberIds, engagementByNodeId),
  }));
}
