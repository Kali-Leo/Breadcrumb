/**
 * Purpose: the three-layer world — hierarchical clustering (village -> kingdom -> geo)
 * with spatial continuity: villages are force-laid-out, every parent sits at the
 * centroid of its children, so zooming between layers never teleports.
 * Main exports: computeLayeredMap, LayeredMap, LayerCluster.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { clusterNodes, type EmbeddedNode } from "./clustering";
import type { InternalNodePosition } from "./internalLayout";
import { computeMapLayout } from "./layout";

export type LayerKey = "village" | "kingdom" | "geo";

export interface LayerCluster {
  id: string;
  name: string;
  x: number;
  y: number;
  nodeIds: string[];
  /** Texture scale slot, e.g. village: tier1..tier4; kingdom: small|large; geo: island. */
  scaleSlot: string;
  /** Member node offsets (village layer only) — powers the deepest zoom and anchoring. */
  internal?: InternalNodePosition[];
}

export interface LayeredMap {
  village: LayerCluster[];
  kingdom: LayerCluster[];
  geo: LayerCluster[];
}

const KINGDOM_THRESHOLD = 0.8;
const GEO_THRESHOLD = 0.74;

function villageScaleSlot(nodeCount: number): string {
  if (nodeCount >= 15) return "tier4";
  if (nodeCount >= 8) return "tier3";
  if (nodeCount >= 3) return "tier2";
  return "tier1";
}

function centroidOf(children: readonly LayerCluster[]): { x: number; y: number } {
  const x = children.reduce((sum, child) => sum + child.x, 0) / children.length;
  const y = children.reduce((sum, child) => sum + child.y, 0) / children.length;
  return { x, y };
}

/** Groups child clusters whose member embeddings merge at a looser threshold. */
function groupChildren(
  children: readonly LayerCluster[],
  embeddings: ReadonlyMap<string, readonly number[]>,
  threshold: number,
  layerName: string,
  slotOf: (nodeCount: number) => string,
): LayerCluster[] {
  const embedded: EmbeddedNode[] = children.flatMap((child) =>
    child.nodeIds
      .filter((nodeId) => embeddings.has(nodeId))
      .map((nodeId) => ({ nodeId, vector: embeddings.get(nodeId) ?? [] })),
  );
  const merged = clusterNodes(embedded, threshold);
  const parentOfNode = new Map<string, number>();
  merged.forEach((memberIds, index) => {
    for (const nodeId of memberIds) parentOfNode.set(nodeId, index);
  });

  const childrenByParent = new Map<number, LayerCluster[]>();
  for (const child of children) {
    const parentIndex = parentOfNode.get(child.nodeIds[0] ?? "") ?? -1;
    const siblings = childrenByParent.get(parentIndex) ?? [];
    siblings.push(child);
    childrenByParent.set(parentIndex, siblings);
  }

  return [...childrenByParent.entries()].map(([parentIndex, members]) => {
    const nodeIds = members.flatMap((member) => member.nodeIds);
    const center = centroidOf(members);
    const biggest = [...members].sort((a, b) => b.nodeIds.length - a.nodeIds.length)[0];
    return {
      id: `${layerName}-${parentIndex}`,
      name: biggest?.name ?? "未名之地",
      x: center.x,
      y: center.y,
      nodeIds,
      scaleSlot: slotOf(nodeIds.length),
    };
  });
}

export function computeLayeredMap(
  nodes: readonly KnowledgeNodeRow[],
  embeddings: ReadonlyMap<string, readonly number[]>,
): LayeredMap {
  const places = computeMapLayout(nodes, embeddings);
  const village: LayerCluster[] = places.map((place) => ({
    id: place.id,
    name: place.name,
    x: place.x,
    y: place.y,
    nodeIds: place.nodeIds,
    scaleSlot: villageScaleSlot(place.nodeIds.length),
    internal: place.internal,
  }));
  const kingdom = groupChildren(village, embeddings, KINGDOM_THRESHOLD, "kingdom", (count) =>
    count >= 10 ? "large" : "small",
  );
  const geo = groupChildren(kingdom, embeddings, GEO_THRESHOLD, "geo", () => "island");
  return { village, kingdom, geo };
}
