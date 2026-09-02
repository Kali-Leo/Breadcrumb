/**
 * Purpose: the one structural-depth helper the planner shares — for each node, the longest
 * downstream requires-chain starting at it (this node counted), following only requires edges
 * that stay inside a caller-given scope. recommendRoute scopes it to a goal's gap; frontier
 * scopes it to the whole graph as its difficulty proxy. Pure math, no DB, no I/O.
 * Main exports: longestRequiresChainBelow.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import { outgoingNeighbors } from "@breadcrumb/feature-graph";

/** Longest downstream requires-chain (in nodes, this node counted) starting at each given
 * node, counting only steps that stay inside `scope`. A static structural property — it does
 * not depend on mastery or on scheduling order. The requires graph is guaranteed acyclic
 * (ADR-0008's graph layer rejects cycles at write time), so plain memoized recursion
 * terminates; the sentinel write below is a belt-and-braces guard for a corrupted store. */
export function longestRequiresChainBelow(
  nodeIds: readonly string[],
  scope: ReadonlySet<string>,
  edges: readonly KnowledgeEdgeRow[],
): Map<string, number> {
  const memo = new Map<string, number>();
  function visit(nodeId: string): number {
    const cached = memo.get(nodeId);
    if (cached !== undefined) return cached;
    memo.set(nodeId, 1);
    const children = outgoingNeighbors(edges, nodeId, "requires").filter((id) => scope.has(id));
    const depth = children.length === 0 ? 1 : 1 + Math.max(...children.map(visit));
    memo.set(nodeId, depth);
    return depth;
  }
  for (const nodeId of nodeIds) visit(nodeId);
  return memo;
}
