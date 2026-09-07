/**
 * Purpose: the structural-depth helpers the planner shares — for each node, the longest
 * requires-chain running out of it, following only requires edges that stay inside a
 * caller-given scope. Two directions, because the planner's two callers are asking two
 * different questions of the same graph. Pure math, no DB, no I/O.
 *
 * Edge convention (feature-graph/graph.ts): `source --requires--> target` means source is the
 * prerequisite and target is what depends on it (极限 --requires--> 导数).
 * Main exports: longestRequiresChainAbove, longestRequiresChainBelow.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";

/** requires-edge adjacency in one direction, indexed once per call. The neighbour helpers in
 * feature-graph re-scan the whole edge list per node, which made a depth pass O(V·E) and ran
 * on every recommendation recompute; the map costs one pass and makes it O(V+E). */
function requiresAdjacency(
  edges: readonly KnowledgeEdgeRow[],
  follow: "toDependents" | "toPrerequisites",
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.edge_type !== "requires") continue;
    const [from, to] =
      follow === "toDependents"
        ? [edge.source_id, edge.target_id]
        : [edge.target_id, edge.source_id];
    const list = adjacency.get(from) ?? [];
    list.push(to);
    adjacency.set(from, list);
  }
  return adjacency;
}

/** Longest chain (in nodes, this node counted) reachable from each given node along one
 * direction of the requires graph, counting only steps that stay inside `scope`. A static
 * structural property — it does not depend on mastery or on scheduling order. The requires
 * graph is guaranteed acyclic (the graph layer rejects cycles at write time), so plain
 * memoized recursion terminates; the sentinel write below is a belt-and-braces guard for a
 * corrupted store. */
function longestChain(
  nodeIds: readonly string[],
  scope: ReadonlySet<string>,
  adjacency: ReadonlyMap<string, string[]>,
): Map<string, number> {
  const memo = new Map<string, number>();
  function visit(nodeId: string): number {
    const cached = memo.get(nodeId);
    if (cached !== undefined) return cached;
    memo.set(nodeId, 1);
    const next = (adjacency.get(nodeId) ?? []).filter((id) => scope.has(id));
    const depth = next.length === 0 ? 1 : 1 + Math.max(...next.map(visit));
    memo.set(nodeId, depth);
    return depth;
  }
  for (const nodeId of nodeIds) visit(nodeId);
  return memo;
}

/**
 * Longest chain of things that depend on this node — how much structure still hangs off it.
 * A foundation concept scores high here and a leaf scores 1. recommendRoute uses it inside a
 * goal's gap as "how much of this goal is still downstream of this step".
 */
export function longestRequiresChainBelow(
  nodeIds: readonly string[],
  scope: ReadonlySet<string>,
  edges: readonly KnowledgeEdgeRow[],
): Map<string, number> {
  return longestChain(nodeIds, scope, requiresAdjacency(edges, "toDependents"));
}

/**
 * Longest chain of prerequisites standing behind this node — "how much do I have to have
 * learned before this one makes sense". A foundation concept scores 1 and a node buried under
 * four layers of prerequisites scores 5.
 *
 * This is the frontier's difficulty proxy. Difficulty is *subtracted* from the frontier score,
 * so measuring it as downstream structure would penalize exactly the concepts a learner should
 * meet first: 「加法」has half the tree hanging off it and would score maximum difficulty,
 * while an isolated advanced leaf with nothing after it would score the minimum and go to the
 * top. Pulling the 先挑轻松的 slider — the words the learner actually reads — would then
 * recommend orphaned edge nodes and push the foundations back. Prerequisite depth is what that
 * slider promises: fewest courses to make up first.
 */
export function longestRequiresChainAbove(
  nodeIds: readonly string[],
  scope: ReadonlySet<string>,
  edges: readonly KnowledgeEdgeRow[],
): Map<string, number> {
  return longestChain(nodeIds, scope, requiresAdjacency(edges, "toPrerequisites"));
}
