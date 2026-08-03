/**
 * Purpose: pure goal-gap query — given goal nodes, computes the unmastered requires-closure
 * gap and three deterministic full orderings of it (shortest / steadiest / interest-first),
 * plus a coverage fraction. No DB, no I/O; mastery/interest are pre-computed maps.
 * Main exports: gapAndPath, coverage, GapAndPathInput, GapAndPathResult, GapRoutes.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { incomingNeighbors, prerequisiteClosure } from "@breadcrumb/plugin-graph";

export interface GapAndPathInput {
  nodes: readonly KnowledgeNodeRow[];
  edges: readonly KnowledgeEdgeRow[];
  masteryByNode: ReadonlyMap<string, number>;
  interestByNode: ReadonlyMap<string, number>;
  goalNodeIds: readonly string[];
  /** Mastery value at/above which a node counts as lit. Caller-supplied, mirrors frontier(). */
  litThreshold: number;
}

export interface GapRoutes {
  /** Topological order with no strategy preference beyond a deterministic label tie-break —
   * "the minimal necessary set, in some legal order". */
  shortest: string[];
  /** At each step, the ready node with the most accumulated helps-weight support from
   * already-lit or already-scheduled nodes goes first. */
  steadiest: string[];
  /** At each step, the ready node with the highest interest score goes first. */
  interestFirst: string[];
}

export interface GapAndPathResult {
  gapNodeIds: string[];
  routes: GapRoutes;
}

/** 0..1 fraction of the given node set that's already lit. 1 for an empty set (nothing left
 * to cover — vacuously complete). */
export function coverage(
  nodeIds: readonly string[],
  masteryByNode: ReadonlyMap<string, number>,
  litThreshold: number,
): number {
  if (nodeIds.length === 0) return 1;
  const litCount = nodeIds.filter((id) => (masteryByNode.get(id) ?? 0) >= litThreshold).length;
  return litCount / nodeIds.length;
}

/** The goal's requires-closure plus the goal nodes themselves, minus whatever's already lit —
 * everything still standing between the learner and the goal. Exported so recommendRoute.ts
 * (single-route greedy scoring) computes the exact same gap set without duplicating this
 * closure-minus-lit logic. */
export function computeGap(
  edges: readonly KnowledgeEdgeRow[],
  goalNodeIds: readonly string[],
  isLit: (nodeId: string) => boolean,
): string[] {
  const closureIds = prerequisiteClosure(edges, goalNodeIds);
  const fullSet = new Set([...closureIds, ...goalNodeIds]);
  return [...fullSet].filter((id) => !isLit(id));
}

/** Ready = every requires-prerequisite that's part of the gap has already been scheduled
 * (prerequisites outside the gap are already lit, by construction of computeGap, so they
 * never block). Exported for recommendRoute.ts's own greedy walk. */
export function readyNodes(
  remaining: ReadonlySet<string>,
  scheduledSet: ReadonlySet<string>,
  gapSet: ReadonlySet<string>,
  edges: readonly KnowledgeEdgeRow[],
): string[] {
  return [...remaining].filter((nodeId) =>
    incomingNeighbors(edges, nodeId, "requires").every(
      (prerequisiteId) => !gapSet.has(prerequisiteId) || scheduledSet.has(prerequisiteId),
    ),
  );
}

function scheduleGreedy(
  gapNodeIds: readonly string[],
  edges: readonly KnowledgeEdgeRow[],
  pickNext: (ready: readonly string[], scheduled: readonly string[]) => string,
): string[] {
  const gapSet = new Set(gapNodeIds);
  const remaining = new Set(gapNodeIds);
  const scheduledSet = new Set<string>();
  const scheduled: string[] = [];
  while (remaining.size > 0) {
    const ready = readyNodes(remaining, scheduledSet, gapSet, edges);
    if (ready.length === 0) {
      // Only possible if the requires graph has a cycle, which the graph layer already
      // guards against at write time — surface loudly rather than looping forever.
      throw new Error("gapAndPath: no ready node found — the requires graph has a cycle");
    }
    const next = pickNext(ready, scheduled);
    scheduled.push(next);
    scheduledSet.add(next);
    remaining.delete(next);
  }
  return scheduled;
}

/** Sum of helps-edge weight pointed at nodeId from sources the caller considers "settled"
 * (already lit, or already scheduled earlier in whatever route is being built). Exported for
 * recommendRoute.ts's per-step scoring, which needs the exact same accumulation. */
export function helpsSupportWeight(
  nodeId: string,
  edges: readonly KnowledgeEdgeRow[],
  isSettled: (id: string) => boolean,
): number {
  return edges
    .filter(
      (edge) =>
        edge.edge_type === "helps" && edge.target_id === nodeId && isSettled(edge.source_id),
    )
    .reduce((sum, edge) => sum + edge.weight, 0);
}

export function gapAndPath(input: GapAndPathInput): GapAndPathResult {
  const { nodes, edges, masteryByNode, interestByNode, goalNodeIds, litThreshold } = input;
  const labelById = new Map(nodes.map((node) => [node.id, node.label]));
  const isLit = (nodeId: string) => (masteryByNode.get(nodeId) ?? 0) >= litThreshold;
  const byLabel = (a: string, b: string) =>
    (labelById.get(a) ?? a).localeCompare(labelById.get(b) ?? b);

  const gapNodeIds = computeGap(edges, goalNodeIds, isLit);

  const shortest = scheduleGreedy(
    gapNodeIds,
    edges,
    (ready) => [...ready].sort(byLabel)[0] as string,
  );

  const steadiest = scheduleGreedy(gapNodeIds, edges, (ready, scheduled) => {
    const scheduledSet = new Set(scheduled);
    const isSettled = (id: string) => isLit(id) || scheduledSet.has(id);
    return [...ready].sort(
      (a, b) =>
        helpsSupportWeight(b, edges, isSettled) - helpsSupportWeight(a, edges, isSettled) ||
        byLabel(a, b),
    )[0] as string;
  });

  const interestFirst = scheduleGreedy(
    gapNodeIds,
    edges,
    (ready) =>
      [...ready].sort(
        (a, b) => (interestByNode.get(b) ?? 0) - (interestByNode.get(a) ?? 0) || byLabel(a, b),
      )[0] as string,
  );

  return { gapNodeIds, routes: { shortest, steadiest, interestFirst } };
}
