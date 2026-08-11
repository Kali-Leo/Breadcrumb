/**
 * Purpose: reshape discovered topics (./topics.ts) into the same cartographic island
 * hierarchy shapeTree produces from the tree — one topic becomes one island, sized by
 * engagement weight instead of subtree count. Kingdoms/villages/points inside each island
 * reuse shapeTree's own recursive shaping (indexChildren/shapeKingdom), scoped to that
 * topic's members, so a node whose tree-parent sits in a different topic simply becomes a
 * kingdom root here instead of being dropped.
 * Main exports: shapeTopicIslands.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { TopicAssignment } from "./topics";
import { indexChildren, type ShapedIsland, shapeKingdom } from "./treeShape";

function topicSizeTier(weight: number, maxWeight: number): number {
  if (maxWeight <= 0) return 1;
  return Math.max(1, Math.ceil((6 * weight) / maxWeight));
}

function earliestCreatedAt(nodes: readonly KnowledgeNodeRow[]): string {
  return nodes.reduce(
    (earliest, node) => (node.created_at < earliest ? node.created_at : earliest),
    nodes[0]?.created_at ?? "",
  );
}

export function shapeTopicIslands(
  nodes: readonly KnowledgeNodeRow[],
  assignment: TopicAssignment,
): ShapedIsland[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const maxWeight = assignment.topics.reduce((max, topic) => Math.max(max, topic.weight), 0);

  return assignment.topics.map((topic) => {
    const memberNodes = topic.memberNodeIds
      .map((id) => nodesById.get(id))
      .filter((node): node is KnowledgeNodeRow => node !== undefined);
    const children = indexChildren(memberNodes);
    const kingdomRoots = children.get(null) ?? [];
    return {
      nodeId: `topic:${topic.id}`,
      label: topic.label,
      createdAt: earliestCreatedAt(memberNodes),
      subtreeCount: memberNodes.length,
      sizeTier: topicSizeTier(topic.weight, maxWeight),
      kingdoms: kingdomRoots.map((root) => shapeKingdom(root, children)),
      memberNodeIds: memberNodes.map((node) => node.id),
    };
  });
}
