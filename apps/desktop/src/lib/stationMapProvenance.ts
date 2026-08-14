/**
 * Purpose: builds one station-map line's stations from sightings (first-touch dedup across the
 * whole map), plus spec 040 §7's main-line parent/depth resolution — origin sighting, else the
 * nearest edge-connected earlier station, else a new trunk root. No rendering, no I/O.
 * Main exports: StationDraft, labelFor, buildStationDrafts, resolveMainLineParentage.
 */
import type { KnowledgeEdgeRow, NodeSightingRow } from "@breadcrumb/core-db";
import type { Station } from "./stationMapModel";

export function labelFor(nodeId: string, labelsByNode: ReadonlyMap<string, string>): string {
  return labelsByNode.get(nodeId) ?? nodeId;
}

/** Missing retention (never tracked) reads as fresh, not stale — silence must never look like
 * a warning (product principle 1). */
function isStale(
  nodeId: string,
  retentionByNode: ReadonlyMap<string, number>,
  threshold: number,
): boolean {
  const retention = retentionByNode.get(nodeId);
  return retention !== undefined && retention < threshold;
}

export interface StationDraft {
  station: Station;
  /** The origin_node_id of the sighting this station was built from (spec 040 §7 provenance;
   * NULL = unknown/legacy). */
  originNodeId: string | null;
}

/** Builds one line's stations from the sightings whose message lands in `segmentMessageIds`,
 * in path order (ties broken by sighting time), first-touch deduplicated against `usedNodeIds`
 * (shared across the whole map, so a node stations only once anywhere). Parentage fields start
 * at their degenerate default (parentNodeId null, depth 0); `resolveMainLineParentage` fills
 * them in for the main line only — a fork stub keeps this flat shape (stationMapModel.ts doc). */
export function buildStationDrafts(
  segmentMessageIds: readonly string[],
  sightings: readonly NodeSightingRow[],
  usedNodeIds: Set<string>,
  labelsByNode: ReadonlyMap<string, string>,
  retentionByNode: ReadonlyMap<string, number>,
  threshold: number,
  onActivePath: boolean,
  nodeIdsInOtherTrails: ReadonlySet<string>,
): StationDraft[] {
  const positionByMessageId = new Map(segmentMessageIds.map((id, position) => [id, position]));
  const relevant = sightings
    .filter(
      (sighting) => sighting.message_id !== null && positionByMessageId.has(sighting.message_id),
    )
    .slice()
    .sort((a, b) => {
      const positionA = positionByMessageId.get(a.message_id as string) as number;
      const positionB = positionByMessageId.get(b.message_id as string) as number;
      if (positionA !== positionB) return positionA - positionB;
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const drafts: StationDraft[] = [];
  for (const sighting of relevant) {
    if (usedNodeIds.has(sighting.node_id)) continue;
    usedNodeIds.add(sighting.node_id);
    drafts.push({
      originNodeId: sighting.origin_node_id,
      station: {
        nodeId: sighting.node_id,
        label: labelFor(sighting.node_id, labelsByNode),
        messageId: sighting.message_id as string,
        index: drafts.length,
        onActivePath,
        stale: isStale(sighting.node_id, retentionByNode, threshold),
        transfer: nodeIdsInOtherTrails.has(sighting.node_id),
        parentNodeId: null,
        depth: 0,
        order: drafts.length + 1,
      },
    });
  }
  return drafts;
}

/** Every requires/helps edge between two of this map's stations, as an order-agnostic lookup
 * ("a|b" and "b|a" both present) — spec 040 §7 rules ②③ treat direction as irrelevant. */
function buildEdgePairSet(edges: readonly KnowledgeEdgeRow[]): Set<string> {
  const pairs = new Set<string>();
  for (const edge of edges) {
    pairs.add(`${edge.source_id}|${edge.target_id}`);
    pairs.add(`${edge.target_id}|${edge.source_id}`);
  }
  return pairs;
}

function edgeConnects(pairSet: ReadonlySet<string>, a: string, b: string): boolean {
  return pairSet.has(`${a}|${b}`);
}

/** Spec 040 §7: resolves each main-line station's parent in first-touch order — ① its
 * sighting's origin, when that origin is an earlier main-line station; else ② an edge to the
 * immediately preceding station; else ③ an edge to the nearest (highest-order) earlier
 * station with one; else ④ null (a new trunk root). depth is the resolved parent's depth + 1,
 * or 0 at a root. Mutates each draft's station in place. An origin pointing at a later station
 * (or at no station on this line at all) simply doesn't satisfy ①, falling through to ②③④ —
 * this is also spec 040 §7's cycle-safety case, since ②③④ can never look forward. */
export function resolveMainLineParentage(
  drafts: readonly StationDraft[],
  edges: readonly KnowledgeEdgeRow[],
): void {
  const edgePairSet = buildEdgePairSet(edges);
  const depthByNodeId = new Map<string, number>();
  drafts.forEach((draft, index) => {
    const { station, originNodeId } = draft;
    let parentNodeId: string | null = null;

    if (originNodeId !== null && depthByNodeId.has(originNodeId)) {
      parentNodeId = originNodeId; // rule ①
    } else {
      const previous = drafts[index - 1];
      if (
        previous !== undefined &&
        edgeConnects(edgePairSet, station.nodeId, previous.station.nodeId)
      ) {
        parentNodeId = previous.station.nodeId; // rule ②
      } else {
        for (let j = index - 1; j >= 0; j -= 1) {
          const candidate = drafts[j] as StationDraft;
          if (edgeConnects(edgePairSet, station.nodeId, candidate.station.nodeId)) {
            parentNodeId = candidate.station.nodeId; // rule ③ — nearest first-touch match
            break;
          }
        }
      }
    }

    station.parentNodeId = parentNodeId; // rule ④ default: stays null
    station.depth = parentNodeId === null ? 0 : (depthByNodeId.get(parentNodeId) as number) + 1;
    depthByNodeId.set(station.nodeId, station.depth);
  });
}
