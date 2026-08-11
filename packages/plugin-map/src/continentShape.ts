/**
 * Purpose: reshape derived continents (./continents.ts) into the cartographic island
 * hierarchy — one continent becomes one island, sized by engagement weight instead of
 * subtree count. Kingdoms come verbatim from the continent's own kingdom list (tree: the
 * root's direct children; cluster: each member), and villages/points below a kingdom reuse
 * shapeTree's recursion scoped to the continent's members.
 * Main exports: shapeContinents.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { ContinentSummary } from "./continents";
import { indexChildren, type ShapedIsland, shapeKingdom } from "./treeShape";

function continentSizeTier(weight: number, maxWeight: number): number {
  if (maxWeight <= 0) return 1;
  return Math.max(1, Math.ceil((6 * weight) / maxWeight));
}

function earliestCreatedAt(nodes: readonly KnowledgeNodeRow[]): string {
  return nodes.reduce(
    (earliest, node) => (node.created_at < earliest ? node.created_at : earliest),
    nodes[0]?.created_at ?? "",
  );
}

export function shapeContinents(
  nodes: readonly KnowledgeNodeRow[],
  continents: readonly ContinentSummary[],
): ShapedIsland[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const maxWeight = continents.reduce((max, continent) => Math.max(max, continent.weight), 0);

  return continents.map((continent) => {
    const memberNodes = continent.memberNodeIds
      .map((id) => nodesById.get(id))
      .filter((node): node is KnowledgeNodeRow => node !== undefined);
    // Scoped to this continent's members, so a kingdom root's own parent (the continent root,
    // or nothing at all for a cluster member) never pulls extra land in.
    const children = indexChildren(memberNodes);
    return {
      nodeId: `continent:${continent.id}`,
      label: continent.label,
      createdAt: earliestCreatedAt(memberNodes),
      subtreeCount: memberNodes.length,
      sizeTier: continentSizeTier(continent.weight, maxWeight),
      kingdoms: continent.kingdoms
        .map((kingdom) => nodesById.get(kingdom.id))
        .filter((node): node is KnowledgeNodeRow => node !== undefined)
        .map((node) => shapeKingdom(node, children)),
      memberNodeIds: memberNodes.map((node) => node.id),
    };
  });
}
