/**
 * Purpose: turns clusters into positioned map places — force layout where inter-place
 * attraction follows centroid similarity and everything repels. Deterministic:
 * d3-force's phyllotaxis initialization + fixed tick count, no randomness.
 * Main exports: computeMapLayout, MapPlace, PlaceTier.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { clusterNodes, type EmbeddedNode } from "./clustering";
import { centroid, cosineSimilarity } from "./similarity";

export type PlaceTier = "house" | "village" | "city";

export interface MapPlace {
  id: string;
  /** Display name: label of the place's earliest-learned node. */
  name: string;
  x: number;
  y: number;
  /** Visual radius in world units (grows with knowledge). */
  radius: number;
  tier: PlaceTier;
  nodeIds: string[];
}

export function placeTier(nodeCount: number): PlaceTier {
  if (nodeCount >= 8) return "city";
  if (nodeCount >= 3) return "village";
  return "house";
}

interface PlaceDatum extends SimulationNodeDatum {
  id: string;
}

export function computeMapLayout(
  nodes: readonly KnowledgeNodeRow[],
  embeddings: ReadonlyMap<string, readonly number[]>,
): MapPlace[] {
  const embedded: EmbeddedNode[] = nodes
    .filter((node) => embeddings.has(node.id))
    .map((node) => ({ nodeId: node.id, vector: embeddings.get(node.id) ?? [] }));
  if (embedded.length === 0) return [];

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const clusters = clusterNodes(embedded);
  const centroids = clusters.map((memberIds) =>
    centroid(memberIds.map((id) => embeddings.get(id) ?? [])),
  );

  const placeData: PlaceDatum[] = clusters.map((_, index) => ({ id: `place-${index}` }));
  const links: (SimulationLinkDatum<PlaceDatum> & { similarity: number })[] = [];
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      links.push({
        source: `place-${i}`,
        target: `place-${j}`,
        similarity: cosineSimilarity(centroids[i] ?? [], centroids[j] ?? []),
      });
    }
  }

  const radii = clusters.map((memberIds) => 24 + Math.sqrt(memberIds.length) * 14);
  const simulation = forceSimulation(placeData)
    .force(
      "link",
      forceLink<PlaceDatum, (typeof links)[number]>(links)
        .id((datum) => datum.id)
        // Higher similarity -> shorter ideal distance (related places sit near each other).
        .distance((link) => 140 + (1 - link.similarity) * 420)
        .strength((link) => Math.max(0.05, link.similarity)),
    )
    .force("charge", forceManyBody().strength(-260))
    .force(
      "collide",
      forceCollide<PlaceDatum>().radius((_, index) => (radii[index] ?? 24) + 40),
    )
    .force("x", forceX(0).strength(0.03))
    .force("y", forceY(0).strength(0.03))
    .stop();
  for (let tick = 0; tick < 300; tick++) {
    simulation.tick();
  }

  return clusters.map((memberIds, index) => {
    const membersOldestFirst = [...memberIds].sort((a, b) => {
      const nodeA = nodeById.get(a);
      const nodeB = nodeById.get(b);
      return (nodeA?.created_at ?? "").localeCompare(nodeB?.created_at ?? "");
    });
    const nameNode = nodeById.get(membersOldestFirst[0] ?? "");
    return {
      id: `place-${index}`,
      name: nameNode?.label ?? "未知之地",
      x: placeData[index]?.x ?? 0,
      y: placeData[index]?.y ?? 0,
      radius: radii[index] ?? 24,
      tier: placeTier(memberIds.length),
      nodeIds: membersOldestFirst,
    };
  });
}
