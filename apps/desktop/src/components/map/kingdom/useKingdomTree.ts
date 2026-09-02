/**
 * Purpose: the kingdom's derived network (spec 049) — planner rows filtered to this region
 * and turned into view nodes, the recommendation pick under the goal-domain filter, the
 * collapsed visible tree, the lateral edges worth drawing, and the pin set. Memoized on the
 * store data it reads; state lives in useKingdomViewState.
 * Main exports: KingdomTreeModel, useKingdomTree.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import { LIT_THRESHOLD } from "@breadcrumb/feature-memory";
import { visibleFrontier } from "@breadcrumb/feature-planner";
import { useMemo } from "react";
import { computeVisibleTree, type VisibleTreeNode } from "../../../lib/map/kingdomCollapse";
import {
  deriveKingdomNodes,
  type KingdomViewNode,
  type LateralEdgeView,
  pickRecommendation,
  type RecommendationPick,
  visibleLateralEdges,
} from "../../../lib/map/kingdomView";
import { goalNodeIds as parseGoalNodeIds } from "../../../lib/planner/plannerGapActions";
import { usePlannerStore } from "../../../stores/plannerStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import type { KingdomViewState } from "./useKingdomViewState";

export interface KingdomTreeModel {
  viewNodes: KingdomViewNode[];
  nodeById: ReadonlyMap<string, KingdomViewNode>;
  visibleNodes: VisibleTreeNode[];
  lateralEdges: LateralEdgeView[];
  edges: readonly KnowledgeEdgeRow[];
  recommendation: RecommendationPick;
  primaryId: string | null;
  pinnedIds: ReadonlySet<string>;
  hasLateralEdges: boolean;
}

export function useKingdomTree(
  memberNodeIds: readonly string[],
  state: KingdomViewState,
): KingdomTreeModel {
  const nodes = usePlannerStore((store) => store.nodes);
  const edges = usePlannerStore((store) => store.edges);
  const masteryByNode = usePlannerStore((store) => store.masteryByNode);
  const sightedNodeIds = usePlannerStore((store) => store.sightedNodeIds);
  const frontierCandidates = usePlannerStore((store) => store.frontierCandidates);
  const goals = usePlannerStore((store) => store.goals);
  const selectedGoalId = usePlannerStore((store) => store.selectedGoalId);
  const learningMode = useSettingsStore((store) => store.learningMode);

  const memberSet = useMemo(() => new Set(memberNodeIds), [memberNodeIds]);
  const goalDomainNodeIds = useMemo(() => {
    if (learningMode !== "ranked") return new Set<string>();
    const goal = goals.find((candidate) => candidate.id === selectedGoalId);
    if (goal === undefined) return new Set<string>();
    const goalIds = parseGoalNodeIds(goal);
    return new Set(goalIds.filter((id) => memberSet.has(id)));
  }, [learningMode, goals, selectedGoalId, memberSet]);

  const viewNodes = useMemo(
    () =>
      deriveKingdomNodes({
        members: nodes.filter((node) => memberSet.has(node.id)),
        masteryByNode,
        litThreshold: LIT_THRESHOLD,
        sightedNodeIds,
        goalDomainNodeIds,
      }),
    [nodes, memberSet, masteryByNode, sightedNodeIds, goalDomainNodeIds],
  );
  const nodeById = useMemo(() => new Map(viewNodes.map((node) => [node.id, node])), [viewNodes]);

  const recommendation = useMemo(
    () =>
      pickRecommendation({
        candidates: frontierCandidates,
        memberIds: memberSet,
        goalDomainNodeIds,
        nodes: viewNodes,
      }),
    [frontierCandidates, memberSet, goalDomainNodeIds, viewNodes],
  );
  const primaryId = recommendation.primary?.nodeId ?? null;

  const visibleNodes = useMemo(
    () =>
      computeVisibleTree({
        nodes: viewNodes,
        nextNodeId: primaryId,
        manualCollapsedIds: state.manualCollapsed,
        manualExpandedIds: state.manualExpanded,
      }),
    [viewNodes, primaryId, state.manualCollapsed, state.manualExpanded],
  );
  const lateralEdges = useMemo(
    () =>
      visibleLateralEdges({
        edges,
        visibleIds: new Set(visibleNodes.map((node) => node.id)),
        nextNodeId: primaryId,
        focusNodeId: state.selectedId ?? state.hoverId,
        showAll: state.showAllEdges,
      }),
    [edges, visibleNodes, primaryId, state.selectedId, state.hoverId, state.showAllEdges],
  );

  // Pins mark the SAME recommendation set the world map pins mark (spec 060 §1's one set),
  // plus this region's own primary so the card and the tree never disagree.
  const pinnedIds = useMemo(() => {
    const pinned = new Set(
      visibleFrontier(frontierCandidates)
        .filter((candidate) => memberSet.has(candidate.nodeId))
        .map((candidate) => candidate.nodeId),
    );
    if (primaryId !== null) pinned.add(primaryId);
    return pinned;
  }, [frontierCandidates, memberSet, primaryId]);

  // The relations toggle only exists where it can change anything: this kingdom actually
  // carries requires/helps edges (Leo 2026-08-31 #4 — a control that does nothing teaches
  // the user to distrust controls).
  const hasLateralEdges = useMemo(
    () =>
      edges.some(
        (edge) =>
          (edge.edge_type === "requires" || edge.edge_type === "helps") &&
          memberSet.has(edge.source_id) &&
          memberSet.has(edge.target_id),
      ),
    [edges, memberSet],
  );

  return {
    viewNodes,
    nodeById,
    visibleNodes,
    lateralEdges,
    edges,
    recommendation,
    primaryId,
    pinnedIds,
    hasLateralEdges,
  };
}
