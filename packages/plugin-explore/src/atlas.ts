/**
 * Purpose: builds the six-layer exploration atlas for one conversation (spec 039 §2.4) — pure
 * derivation from sightings and the global edge library, no LLM, no ranking judgment.
 * Main exports: buildExplorationAtlas, ExplorationAtlas, STALE_RETENTION_THRESHOLD.
 */
import type { KnowledgeEdgeRow, NodeSightingRow } from "@breadcrumb/core-db";

export interface AtlasNode {
  nodeId: string;
  label: string;
}

export interface AtlasDetour {
  kind: "backfill" | "revisit";
  nodeId: string;
  relatedNodeId: string | null;
}

export interface AtlasFrontierItem {
  nodeId: string;
  label: string;
  viaNodeId: string;
  edgeType: "requires" | "helps";
  /** true = the frontier node is a prerequisite of the visited one. */
  isPrerequisiteOfVisited: boolean;
}

export interface ExplorationAtlas {
  /** Visited nodes in first-sighting order. */
  trail: AtlasNode[];
  /** Edges between visited nodes. */
  structure: KnowledgeEdgeRow[];
  /** backfill: a requires edge whose prerequisite was visited later than its dependent.
   * revisit: a node re-sighted after the trail moved on to a different node. */
  detours: AtlasDetour[];
  /** Edges between two visited nodes whose trail positions are not adjacent. */
  unusedLinks: KnowledgeEdgeRow[];
  /** Edges with exactly one end visited — the unvisited end, with direction semantics. */
  frontier: AtlasFrontierItem[];
  /** Visited nodes whose retention has dropped below the staleness threshold. */
  staleness: AtlasNode[];
}

/** Below this retention, a visited node counts as a "stale old friend" worth a re-encounter. */
export const STALE_RETENTION_THRESHOLD = 0.6;

export interface AtlasInput {
  /** Single conversation, already sorted ascending by time. */
  sightings: readonly NodeSightingRow[];
  labelsByNode: ReadonlyMap<string, string>;
  /** Full edge library — this function filters down to what the trail touches. */
  edges: readonly KnowledgeEdgeRow[];
  retentionByNode: ReadonlyMap<string, number>;
}

function labelFor(nodeId: string, labelsByNode: ReadonlyMap<string, string>): string {
  return labelsByNode.get(nodeId) ?? nodeId;
}

/** Visited nodes in first-sighting order, deduplicated. */
function buildTrail(
  sightings: readonly NodeSightingRow[],
  labelsByNode: ReadonlyMap<string, string>,
): AtlasNode[] {
  const seen = new Set<string>();
  const trail: AtlasNode[] = [];
  for (const sighting of sightings) {
    if (seen.has(sighting.node_id)) continue;
    seen.add(sighting.node_id);
    trail.push({ nodeId: sighting.node_id, label: labelFor(sighting.node_id, labelsByNode) });
  }
  return trail;
}

/** requires edges among visited nodes whose prerequisite was reached after its dependent —
 * the user backfilled a foundation it turned out it needed. */
function buildBackfillDetours(
  structure: readonly KnowledgeEdgeRow[],
  trailPositionByNode: ReadonlyMap<string, number>,
): AtlasDetour[] {
  const detours: AtlasDetour[] = [];
  for (const edge of structure) {
    if (edge.edge_type !== "requires") continue;
    const prerequisitePosition = trailPositionByNode.get(edge.source_id);
    const dependentPosition = trailPositionByNode.get(edge.target_id);
    if (prerequisitePosition === undefined || dependentPosition === undefined) continue;
    if (prerequisitePosition > dependentPosition) {
      detours.push({ kind: "backfill", nodeId: edge.source_id, relatedNodeId: edge.target_id });
    }
  }
  return detours;
}

/** A node was re-sighted after the raw (non-deduplicated) sighting sequence moved on to at
 * least one different node — reported once per node, in first-occurrence order. */
function buildRevisitDetours(sightings: readonly NodeSightingRow[]): AtlasDetour[] {
  const sequence = sightings.map((sighting) => sighting.node_id);
  const occurrencesByNode = new Map<string, number[]>();
  sequence.forEach((nodeId, index) => {
    const indices = occurrencesByNode.get(nodeId) ?? [];
    indices.push(index);
    occurrencesByNode.set(nodeId, indices);
  });

  const detours: AtlasDetour[] = [];
  for (const [nodeId, indices] of occurrencesByNode) {
    for (let k = 1; k < indices.length; k += 1) {
      const previous = indices[k - 1] as number;
      const current = indices[k] as number;
      const interrupted = sequence.slice(previous + 1, current).some((other) => other !== nodeId);
      if (interrupted) {
        detours.push({ kind: "revisit", nodeId, relatedNodeId: null });
        break;
      }
    }
  }
  return detours;
}

/** Edges with exactly one end in the visited set — the unvisited end becomes a frontier item. */
function buildFrontier(
  edges: readonly KnowledgeEdgeRow[],
  trailNodeIds: ReadonlySet<string>,
  labelsByNode: ReadonlyMap<string, string>,
): AtlasFrontierItem[] {
  const frontier: AtlasFrontierItem[] = [];
  for (const edge of edges) {
    const sourceVisited = trailNodeIds.has(edge.source_id);
    const targetVisited = trailNodeIds.has(edge.target_id);
    if (sourceVisited === targetVisited) continue;
    const unvisitedNodeId = sourceVisited ? edge.target_id : edge.source_id;
    const viaNodeId = sourceVisited ? edge.source_id : edge.target_id;
    frontier.push({
      nodeId: unvisitedNodeId,
      label: labelFor(unvisitedNodeId, labelsByNode),
      viaNodeId,
      edgeType: edge.edge_type,
      isPrerequisiteOfVisited: edge.edge_type === "requires" && edge.source_id === unvisitedNodeId,
    });
  }
  return frontier;
}

export function buildExplorationAtlas(input: AtlasInput): ExplorationAtlas {
  const trail = buildTrail(input.sightings, input.labelsByNode);
  const trailNodeIds = new Set(trail.map((node) => node.nodeId));
  const trailPositionByNode = new Map(trail.map((node, index) => [node.nodeId, index]));

  const structure = input.edges.filter(
    (edge) => trailNodeIds.has(edge.source_id) && trailNodeIds.has(edge.target_id),
  );

  const detours = [
    ...buildBackfillDetours(structure, trailPositionByNode),
    ...buildRevisitDetours(input.sightings),
  ];

  const unusedLinks = structure.filter((edge) => {
    const sourcePosition = trailPositionByNode.get(edge.source_id) as number;
    const targetPosition = trailPositionByNode.get(edge.target_id) as number;
    return Math.abs(sourcePosition - targetPosition) !== 1;
  });

  const frontier = buildFrontier(input.edges, trailNodeIds, input.labelsByNode);

  const staleness = trail.filter(
    (node) => (input.retentionByNode.get(node.nodeId) ?? 0) < STALE_RETENTION_THRESHOLD,
  );

  return { trail, structure, detours, unusedLinks, frontier, staleness };
}
