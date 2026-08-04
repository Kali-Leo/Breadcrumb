/**
 * Purpose: pure data assembly for GoalOverlayView (spec 017 #2) — scopes a goal's prerequisite
 * closure, tags each node's lit/dim/target state and next-step flag, and keeps the in-scope
 * requires/helps edges. Positions are computed separately (see overlayLayout.ts) so this module
 * stays purely about "which nodes/edges, in what state" — not "where". No React/DOM here.
 * Main exports: buildOverlayModel, OverlayModel, OverlayModelInput, OverlayNode, OverlayEdge,
 * OverlayNodeState.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { prerequisiteClosure } from "@breadcrumb/plugin-graph";
import type { RecommendedRouteStep } from "@breadcrumb/plugin-planner";

/** 'lit' = mastery at/above litThreshold; 'dim' = at/above dimThreshold but below lit; 'target'
 * = in the goal's closure but neither — the learner hasn't touched it yet. */
export type OverlayNodeState = "lit" | "dim" | "target";

export interface OverlayNode {
  id: string;
  label: string;
  state: OverlayNodeState;
  /** Raw goal-view mastery (0..1) `state` was derived from — the hover tooltip's "掌握度". */
  mastery: number;
  /** True for the single node recommendRoute() would have the learner do next. */
  isNextStep: boolean;
  interest: number;
  evidenceWeight: number;
}

export interface OverlayEdge {
  source: string;
  target: string;
  type: "requires" | "helps";
  weight: number;
}

export interface OverlayModel {
  nodes: OverlayNode[];
  edges: OverlayEdge[];
}

export interface OverlayModelInput {
  goalNodeIds: readonly string[];
  nodes: readonly KnowledgeNodeRow[];
  edges: readonly KnowledgeEdgeRow[];
  /** Same goal-view-boosted mastery map coverage()/milestone() use (masteryAsSeenByGoal). */
  goalMasteryByNode: ReadonlyMap<string, number>;
  interestByNode: ReadonlyMap<string, number>;
  evidenceWeightByNode: ReadonlyMap<string, number>;
  /** The current recommended route; only its first step matters here (isNextStep). Null when
   * the gap is already empty or no route could be computed. */
  route: readonly RecommendedRouteStep[] | null;
  litThreshold: number;
  dimThreshold: number;
}

function nodeState(mastery: number, litThreshold: number, dimThreshold: number): OverlayNodeState {
  if (mastery >= litThreshold) return "lit";
  if (mastery >= dimThreshold) return "dim";
  return "target";
}

export function buildOverlayModel(input: OverlayModelInput): OverlayModel {
  const {
    goalNodeIds,
    nodes,
    edges,
    goalMasteryByNode,
    interestByNode,
    evidenceWeightByNode,
    route,
    litThreshold,
    dimThreshold,
  } = input;

  const labelById = new Map(nodes.map((node) => [node.id, node.label]));
  const closureIds = prerequisiteClosure(edges, goalNodeIds);
  // Sorted by id, not Set-iteration order, so the scope (and therefore the layout built from it)
  // is identical across repeated calls with the same inputs.
  const scopeIds = [...new Set([...closureIds, ...goalNodeIds])].sort();
  const scopeSet = new Set(scopeIds);
  const nextStepId = route?.[0]?.nodeId;

  const overlayEdges: OverlayEdge[] = edges
    .filter(
      (edge) =>
        (edge.edge_type === "requires" || edge.edge_type === "helps") &&
        scopeSet.has(edge.source_id) &&
        scopeSet.has(edge.target_id),
    )
    .map((edge) => ({
      source: edge.source_id,
      target: edge.target_id,
      type: edge.edge_type,
      weight: edge.weight,
    }))
    .sort((a, b) => `${a.source}>${a.target}`.localeCompare(`${b.source}>${b.target}`));

  const overlayNodes: OverlayNode[] = scopeIds.map((id) => {
    const mastery = goalMasteryByNode.get(id) ?? 0;
    return {
      id,
      label: labelById.get(id) ?? id,
      state: nodeState(mastery, litThreshold, dimThreshold),
      mastery,
      isNextStep: id === nextStepId,
      interest: interestByNode.get(id) ?? 0,
      evidenceWeight: evidenceWeightByNode.get(id) ?? 0,
    };
  });

  return { nodes: overlayNodes, edges: overlayEdges };
}
