/**
 * Purpose: pure derivation of one conversation's station map (spec 040 §3, provenance-tree'd
 * by §7) — the active path's stations arranged as an origin tree (station drafting and parent
 * resolution live in stationMapProvenance.ts), each unvisited branch's stub (dropped when it
 * has no stations, and never parent-resolved — fork stubs keep spec 040 §3's flat shape), and
 * a capped frontier. Also marks "transfer" stations sighted in another conversation too (spec
 * 041 §3). No rendering, no I/O.
 * Main exports: Station, BranchStub, FrontierStop, StationMapModel, buildStationMapModel.
 */
import type { KnowledgeEdgeRow, MessageRow, NodeSightingRow } from "@breadcrumb/core-db";
import { effectiveParentById, newestLeafId, pathToLeaf } from "./messageTree";
import { buildStationDrafts, labelFor, resolveMainLineParentage } from "./stationMapProvenance";

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
  /** Spec 040 §7: the earlier station this one grew out of. Always null on a branch (fork
   * stubs keep their flat spec-040 §3 shape — see module doc). Null on the main line means
   * "new trunk root": no origin sighting and no edge tied it to any earlier main-line station. */
  parentNodeId: string | null;
  /** Length of the parentNodeId chain back to a trunk root (root itself = 0). Always 0 on a
   * branch. */
  depth: number;
  /** 1-based first-touch sequence number within this station's own line. */
  order: number;
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
  /** Edges among nodes touched by this conversation (e.g. atlas.structure) — direction is
   * ignored, only "is there any requires/helps edge between these two nodes" matters (spec
   * 040 §7 rules ②③). A wider edge set (the whole library) works too: only edges between two
   * of this map's stations can ever match. */
  edges: readonly KnowledgeEdgeRow[];
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
  const mainLineDrafts = buildStationDrafts(
    activePathIds,
    input.sightings,
    usedNodeIds,
    input.labelsByNode,
    input.retentionByNode,
    threshold,
    true,
    nodeIdsInOtherTrails,
  );
  const orderedDrafts = resolveMainLineParentage(mainLineDrafts, input.edges);
  const mainLine = orderedDrafts.map((draft) => draft.station);

  const candidates = findBranchCandidates(input.rows, activePathIds, activeLeafId);
  const branches: BranchStub[] = [];
  for (const candidate of candidates) {
    const stations = buildStationDrafts(
      candidate.segment,
      input.sightings,
      usedNodeIds,
      input.labelsByNode,
      input.retentionByNode,
      threshold,
      false,
      nodeIdsInOtherTrails,
    ).map((draft) => draft.station);
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
