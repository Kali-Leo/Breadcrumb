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

/** Spec 040 §7 (revised 2026-08-14 late): resolves each main-line station's parent — ① its
 * sighting's origin, when that origin is ANY station on this line (extraction may land the
 * anchor after its children in the same round, so "earlier only" was wrong); else ② an edge
 * to the first-touch-preceding station; else ③ an edge to the nearest earlier station; else
 * ④ null (a new trunk root). Origin cycles are broken at the earliest-touched member, which
 * becomes a root. Returns the drafts in STRUCTURE-FIRST order — parents before children
 * (DFS pre-order; roots and siblings keep first-touch order) — with index/order/depth
 * rewritten to match: the tree's geometry follows structure, time survives as the order tag. */
export function resolveMainLineParentage(
  drafts: readonly StationDraft[],
  edges: readonly KnowledgeEdgeRow[],
): StationDraft[] {
  const edgePairSet = buildEdgePairSet(edges);
  const nodeIds = new Set(drafts.map((draft) => draft.station.nodeId));
  const parentByNodeId = new Map<string, string | null>();

  drafts.forEach((draft, index) => {
    const { station, originNodeId } = draft;
    let parentNodeId: string | null = null;
    if (originNodeId !== null && originNodeId !== station.nodeId && nodeIds.has(originNodeId)) {
      parentNodeId = originNodeId; // rule ① — any station on this line
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
    parentByNodeId.set(station.nodeId, parentNodeId); // rule ④ default: null
  });

  // Cycle safety: walk each parent chain; on revisiting a node within one walk, root the
  // cycle at its earliest-touched member (first-touch order = draft order).
  const touchOrder = new Map(drafts.map((draft, index) => [draft.station.nodeId, index]));
  for (const draft of drafts) {
    const seen = new Set<string>();
    let current: string | null = draft.station.nodeId;
    while (current !== null && !seen.has(current)) {
      seen.add(current);
      current = parentByNodeId.get(current) ?? null;
    }
    if (current !== null) {
      const cycleMembers = [...seen];
      const earliest = cycleMembers.reduce((a, b) =>
        (touchOrder.get(a) as number) <= (touchOrder.get(b) as number) ? a : b,
      );
      parentByNodeId.set(earliest, null);
    }
  }

  // Structure-first reorder: DFS pre-order from roots, siblings in first-touch order.
  const draftByNodeId = new Map(drafts.map((draft) => [draft.station.nodeId, draft]));
  const childrenByParent = new Map<string | null, StationDraft[]>();
  for (const draft of drafts) {
    const parent = parentByNodeId.get(draft.station.nodeId) ?? null;
    const bucket = childrenByParent.get(parent) ?? [];
    bucket.push(draft);
    childrenByParent.set(parent, bucket);
  }
  const ordered: StationDraft[] = [];
  const visit = (draft: StationDraft, depth: number) => {
    draft.station.parentNodeId = parentByNodeId.get(draft.station.nodeId) ?? null;
    draft.station.depth = depth;
    draft.station.index = ordered.length;
    draft.station.order = ordered.length + 1;
    ordered.push(draft);
    for (const child of childrenByParent.get(draft.station.nodeId) ?? []) visit(child, depth + 1);
  };
  for (const root of childrenByParent.get(null) ?? []) visit(root, 0);
  // Unreachable leftovers (should not happen) keep the map total rather than vanishing.
  for (const draft of drafts) if (!ordered.includes(draft)) visit(draft, 0);
  void draftByNodeId;
  return ordered;
}
