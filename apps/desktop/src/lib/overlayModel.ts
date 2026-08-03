/**
 * Purpose: pure data assembly for GoalOverlayView (spec 017 #2) — scopes a goal's prerequisite
 * closure, tags each node's lit/dim/target state and next-step flag, keeps in-scope
 * requires/helps edges, and lays the result out with @dagrejs/dagre (ADR-0012) so the same
 * graph always renders at the same pixel positions. No React/DOM here.
 * Main exports: buildOverlayModel, OverlayModel, OverlayModelInput, OverlayNode, OverlayEdge,
 * OverlayNodeState.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { prerequisiteClosure } from "@breadcrumb/plugin-graph";
import type { RecommendedRouteStep } from "@breadcrumb/plugin-planner";
import * as dagre from "@dagrejs/dagre";

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
  x: number;
  y: number;
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
  /** SVG viewBox size dagre computed the layout within. */
  width: number;
  height: number;
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

/** Fixed box size dagre lays out around — generous enough for a few Chinese characters plus
 * padding without measuring real text (no DOM access in this pure module). Exported so the
 * SVG renderer (GoalOverlayView) draws boxes at exactly the size dagre assumed. */
export const OVERLAY_NODE_WIDTH = 152;
export const OVERLAY_NODE_HEIGHT = 40;
const RANK_SEPARATION = 64;
const NODE_SEPARATION = 24;

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
  // Sorted by id, not Set-iteration order, so the graph is built identically (and dagre lays
  // out identically) across repeated calls with the same inputs.
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

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", ranksep: RANK_SEPARATION, nodesep: NODE_SEPARATION });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const id of scopeIds) {
    graph.setNode(id, { width: OVERLAY_NODE_WIDTH, height: OVERLAY_NODE_HEIGHT });
  }
  // Layering follows requires edges only (prerequisites left, dependents right) — helps edges
  // are drawn as decoration in T5 but don't drive rank assignment.
  for (const edge of overlayEdges) {
    if (edge.type === "requires") graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);

  const overlayNodes: OverlayNode[] = scopeIds.map((id) => {
    const mastery = goalMasteryByNode.get(id) ?? 0;
    const position = graph.node(id);
    return {
      id,
      label: labelById.get(id) ?? id,
      state: nodeState(mastery, litThreshold, dimThreshold),
      mastery,
      isNextStep: id === nextStepId,
      interest: interestByNode.get(id) ?? 0,
      evidenceWeight: evidenceWeightByNode.get(id) ?? 0,
      x: position.x,
      y: position.y,
    };
  });

  const graphLabel = graph.graph();
  return {
    nodes: overlayNodes,
    edges: overlayEdges,
    width: graphLabel.width ?? 0,
    height: graphLabel.height ?? 0,
  };
}
