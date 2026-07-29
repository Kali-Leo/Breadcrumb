/**
 * Purpose: positions a place's member nodes inside its disc — similarity-driven force
 * layout clamped to the region radius. Deterministic (phyllotaxis init, fixed ticks).
 * Main exports: computePlaceInternalLayout, InternalNodePosition.
 */
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
import { cosineSimilarity } from "./similarity";

export interface InternalNodePosition {
  nodeId: string;
  /** Offsets from the place center, in world units. */
  dx: number;
  dy: number;
}

interface MemberDatum extends SimulationNodeDatum {
  id: string;
}

export function computePlaceInternalLayout(
  memberNodeIds: readonly string[],
  embeddings: ReadonlyMap<string, readonly number[]>,
  regionRadius: number,
): InternalNodePosition[] {
  if (memberNodeIds.length === 0) return [];
  if (memberNodeIds.length === 1) {
    const only = memberNodeIds[0];
    return only ? [{ nodeId: only, dx: 0, dy: 0 }] : [];
  }

  const members: MemberDatum[] = memberNodeIds.map((id) => ({ id }));
  const links: (SimulationLinkDatum<MemberDatum> & { similarity: number })[] = [];
  for (let i = 0; i < memberNodeIds.length; i++) {
    for (let j = i + 1; j < memberNodeIds.length; j++) {
      const a = memberNodeIds[i];
      const b = memberNodeIds[j];
      if (!a || !b) continue;
      links.push({
        source: a,
        target: b,
        similarity: cosineSimilarity(embeddings.get(a) ?? [], embeddings.get(b) ?? []),
      });
    }
  }

  const spread = regionRadius * 1.35;
  const simulation = forceSimulation(members)
    .force(
      "link",
      forceLink<MemberDatum, (typeof links)[number]>(links)
        .id((datum) => datum.id)
        .distance((link) => spread * 0.35 + (1 - link.similarity) * spread * 0.6)
        .strength((link) => Math.max(0.05, link.similarity * 0.8)),
    )
    .force("charge", forceManyBody().strength(-spread * 1.6))
    .force("collide", forceCollide(spread * 0.16))
    .force("x", forceX(0).strength(0.08))
    .force("y", forceY(0).strength(0.08))
    .stop();
  for (let tick = 0; tick < 200; tick++) {
    simulation.tick();
  }

  // Clamp members into the disc so nothing escapes its region.
  return members.map((member) => {
    const distance = Math.hypot(member.x ?? 0, member.y ?? 0);
    const clamp = distance > spread ? spread / distance : 1;
    return { nodeId: member.id, dx: (member.x ?? 0) * clamp, dy: (member.y ?? 0) * clamp };
  });
}
