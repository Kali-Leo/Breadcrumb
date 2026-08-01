/**
 * Purpose: graphology-backed pure graph queries over knowledge edges — requires-edge cycle
 * safety, prerequisite closure, topological order and edge-type-filtered adjacency. Pure
 * functions only: input is a node/edge array, no DB access, no Tauri, no DOM.
 * Main exports: wouldCreateCycle, prerequisiteClosure, topologicalOrder, outgoingNeighbors,
 * incomingNeighbors.
 *
 * Edge direction convention: for a 'requires' edge, source_id is the prerequisite and
 * target_id is what depends on it (e.g. 极限 --requires--> 导数), matching the spec's example.
 */
import type { KnowledgeEdgeRow, KnowledgeEdgeType } from "@breadcrumb/core-db";
import { DirectedGraph } from "graphology";
import { topologicalSort, willCreateCycle } from "graphology-dag";

export interface EdgeCandidate {
  source_id: string;
  target_id: string;
}

/** Builds a directed graph from only the 'requires' edges — the acyclic-constrained subset. */
function buildRequiresGraph(edges: readonly KnowledgeEdgeRow[]): DirectedGraph {
  const graph = new DirectedGraph();
  for (const edge of edges) {
    if (edge.edge_type !== "requires") continue;
    graph.mergeNode(edge.source_id);
    graph.mergeNode(edge.target_id);
    graph.mergeEdge(edge.source_id, edge.target_id);
  }
  return graph;
}

/** True if adding this requires edge to the existing requires graph would create a cycle
 * (including a direct self-loop). Only 'requires' edges participate in cycle safety —
 * 'helps' edges are not constrained to be acyclic. */
export function wouldCreateCycle(
  edges: readonly KnowledgeEdgeRow[],
  candidate: EdgeCandidate,
): boolean {
  if (candidate.source_id === candidate.target_id) return true;
  const graph = buildRequiresGraph(edges);
  graph.mergeNode(candidate.source_id);
  graph.mergeNode(candidate.target_id);
  if (graph.hasEdge(candidate.source_id, candidate.target_id)) return false;
  return willCreateCycle(graph, candidate.source_id, candidate.target_id);
}

/** Every transitive prerequisite (via requires edges) of the given nodes, not including
 * the input nodes themselves. Order is not significant; use topologicalOrder for that. */
export function prerequisiteClosure(
  edges: readonly KnowledgeEdgeRow[],
  nodeIds: readonly string[],
): string[] {
  const graph = buildRequiresGraph(edges);
  const closure = new Set<string>();
  const queue = [...nodeIds];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (!graph.hasNode(current)) continue;
    for (const prerequisite of graph.inNeighbors(current)) {
      if (closure.has(prerequisite)) continue;
      closure.add(prerequisite);
      queue.push(prerequisite);
    }
  }
  return [...closure];
}

/** Topological (prerequisite-first) order of the given nodes, following only the requires
 * edges that run between two nodes both in the given set. */
export function topologicalOrder(
  edges: readonly KnowledgeEdgeRow[],
  nodeIds: readonly string[],
): string[] {
  const nodeIdSet = new Set(nodeIds);
  const subgraph = new DirectedGraph();
  for (const nodeId of nodeIds) subgraph.mergeNode(nodeId);
  for (const edge of edges) {
    if (edge.edge_type !== "requires") continue;
    if (!nodeIdSet.has(edge.source_id) || !nodeIdSet.has(edge.target_id)) continue;
    subgraph.mergeEdge(edge.source_id, edge.target_id);
  }
  return topologicalSort(subgraph);
}

/** Ids reached by outgoing edges of the given type from one node. */
export function outgoingNeighbors(
  edges: readonly KnowledgeEdgeRow[],
  nodeId: string,
  edgeType: KnowledgeEdgeType,
): string[] {
  return edges
    .filter((edge) => edge.source_id === nodeId && edge.edge_type === edgeType)
    .map((edge) => edge.target_id);
}

/** Ids reached by incoming edges of the given type into one node. */
export function incomingNeighbors(
  edges: readonly KnowledgeEdgeRow[],
  nodeId: string,
  edgeType: KnowledgeEdgeType,
): string[] {
  return edges
    .filter((edge) => edge.target_id === nodeId && edge.edge_type === edgeType)
    .map((edge) => edge.source_id);
}
