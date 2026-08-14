/**
 * Purpose: pure derivation of one conversation's station map (spec 040 §3) — the active path's
 * stations, each unvisited branch's stub (dropped when it has no stations), and a capped
 * frontier — from message rows, node sightings, labels, and retention. Also marks "transfer"
 * stations whose node also has a sighting in another conversation (spec 041 §3). No rendering,
 * no I/O.
 * Main exports: Station, BranchStub, FrontierStop, StationMapModel, buildStationMapModel.
 */
import type { MessageRow, NodeSightingRow } from "@breadcrumb/core-db";
import { effectiveParentById, newestLeafId, pathToLeaf } from "./messageTree";

export interface Station {
  nodeId: string;
  label: string;
  messageId: string;
  /** Sequential position within its own line (main line or one branch), first touch first. */
  index: number;
  onActivePath: boolean;
  stale: boolean;
  /** This node also has a sighting in at least one other conversation (spec 041 §3) — renders
   * as a double ring and offers a jump to those other trails. */
  transfer: boolean;
}

export interface BranchStub {
  /** The active-path message this branch forks off of. */
  forkMessageId: string;
  stations: Station[];
  leafId: string;
}

export interface FrontierStop {
  nodeId: string;
  label: string;
  viaLabel: string;
}

export interface StationMapModel {
  mainLine: Station[];
  branches: BranchStub[];
  frontier: FrontierStop[];
  currentMessageId: string | null;
}

export interface BuildStationMapModelInput {
  /** Every message row for the conversation. */
  rows: readonly MessageRow[];
  currentLeafId: string | null;
  /** listByConversation order: time ascending. */
  sightings: readonly NodeSightingRow[];
  labelsByNode: ReadonlyMap<string, string>;
  retentionByNode: ReadonlyMap<string, number>;
  frontier: readonly { nodeId: string; label: string; viaNodeId: string }[];
  /** Below this retention a visited station renders desaturated. Default 0.6 (matches
   * plugin-explore's STALE_RETENTION_THRESHOLD). */
  staleThreshold?: number;
  /** Node ids that have at least one sighting outside this conversation (spec 041 §3) — drives
   * each station's `transfer` flag. Defaults to empty (no transfers marked). */
  nodeIdsInOtherTrails?: ReadonlySet<string>;
}

const DEFAULT_STALE_THRESHOLD = 0.6;
const MAX_FRONTIER_STOPS = 3;

function labelFor(nodeId: string, labelsByNode: ReadonlyMap<string, string>): string {
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

/** Builds one line's stations from the sightings whose message lands in `segmentMessageIds`,
 * in path order (ties broken by sighting time), first-touch deduplicated against `usedNodeIds`
 * (shared across the whole map, so a node stations only once anywhere). */
function buildStationsForSegment(
  segmentMessageIds: readonly string[],
  sightings: readonly NodeSightingRow[],
  usedNodeIds: Set<string>,
  labelsByNode: ReadonlyMap<string, string>,
  retentionByNode: ReadonlyMap<string, number>,
  threshold: number,
  onActivePath: boolean,
  nodeIdsInOtherTrails: ReadonlySet<string>,
): Station[] {
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

  const stations: Station[] = [];
  for (const sighting of relevant) {
    if (usedNodeIds.has(sighting.node_id)) continue;
    usedNodeIds.add(sighting.node_id);
    stations.push({
      nodeId: sighting.node_id,
      label: labelFor(sighting.node_id, labelsByNode),
      messageId: sighting.message_id as string,
      index: stations.length,
      onActivePath,
      stale: isStale(sighting.node_id, retentionByNode, threshold),
      transfer: nodeIdsInOtherTrails.has(sighting.node_id),
    });
  }
  return stations;
}

interface BranchCandidate {
  forkMessageId: string;
  forkIndex: number;
  leafId: string;
  segment: string[];
}

/** Every leaf's fork-off point against the active path (nearest common ancestor by shared
 * root-to-leaf prefix) plus the message segment after it, for leaves off the active path. */
function findBranchCandidates(
  rows: readonly MessageRow[],
  activePathIds: readonly string[],
  activeLeafId: string | null,
): BranchCandidate[] {
  const parentById = effectiveParentById(rows);
  const parentIds = new Set([...parentById.values()].filter((id): id is string => id !== null));
  const leaves = rows.filter((row) => !parentIds.has(row.id) && row.id !== activeLeafId);

  const candidates: BranchCandidate[] = [];
  for (const leaf of leaves) {
    const leafPathIds = pathToLeaf(rows, leaf.id).map((row) => row.id);
    let commonPrefixEnd = -1;
    for (let i = 0; i < leafPathIds.length; i += 1) {
      if (leafPathIds[i] === activePathIds[i]) commonPrefixEnd = i;
      else break;
    }
    if (commonPrefixEnd === -1) continue; // no shared ancestor with the active path — skip
    const segment = leafPathIds.slice(commonPrefixEnd + 1);
    if (segment.length === 0) continue; // the "branch" is just the fork point itself
    candidates.push({
      forkMessageId: activePathIds[commonPrefixEnd] as string,
      forkIndex: commonPrefixEnd,
      leafId: leaf.id,
      segment,
    });
  }
  candidates.sort(
    (a, b) => a.forkIndex - b.forkIndex || (a.leafId < b.leafId ? -1 : a.leafId > b.leafId ? 1 : 0),
  );
  return candidates;
}

const NO_TRANSFERS: ReadonlySet<string> = new Set();

export function buildStationMapModel(input: BuildStationMapModelInput): StationMapModel {
  const threshold = input.staleThreshold ?? DEFAULT_STALE_THRESHOLD;
  const nodeIdsInOtherTrails = input.nodeIdsInOtherTrails ?? NO_TRANSFERS;
  const activeLeafId = input.currentLeafId ?? newestLeafId(input.rows);
  const activePathIds =
    activeLeafId === null ? [] : pathToLeaf(input.rows, activeLeafId).map((row) => row.id);

  const usedNodeIds = new Set<string>();
  const mainLine = buildStationsForSegment(
    activePathIds,
    input.sightings,
    usedNodeIds,
    input.labelsByNode,
    input.retentionByNode,
    threshold,
    true,
    nodeIdsInOtherTrails,
  );

  const candidates = findBranchCandidates(input.rows, activePathIds, activeLeafId);
  const branches: BranchStub[] = [];
  for (const candidate of candidates) {
    const stations = buildStationsForSegment(
      candidate.segment,
      input.sightings,
      usedNodeIds,
      input.labelsByNode,
      input.retentionByNode,
      threshold,
      false,
      nodeIdsInOtherTrails,
    );
    if (stations.length === 0) continue; // stationless branch, ignored (spec 040 §3)
    branches.push({ forkMessageId: candidate.forkMessageId, stations, leafId: candidate.leafId });
  }

  const frontier: FrontierStop[] = input.frontier.slice(0, MAX_FRONTIER_STOPS).map((stop) => ({
    nodeId: stop.nodeId,
    label: stop.label,
    viaLabel: labelFor(stop.viaNodeId, input.labelsByNode),
  }));

  return { mainLine, branches, frontier, currentMessageId: activeLeafId };
}
