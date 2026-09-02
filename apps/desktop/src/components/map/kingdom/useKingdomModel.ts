/**
 * Purpose: the third zoom level's view model (spec 049) — composes the view's own state
 * (useKingdomViewState) with the derived network (useKingdomTree), resolves the card's node
 * and its relations, and wires the two-stage card's actions. Rendering lives in
 * KingdomView/KingdomTreeSvg/KingdomNodeCard; the actions themselves in lib/map.
 * Main exports: KingdomRef, KingdomModel, useKingdomModel.
 */
import { useMemo } from "react";
import { startKingdomMainAction } from "../../../lib/map/kingdomActions";
import type { VisibleTreeNode } from "../../../lib/map/kingdomCollapse";
import type { LastSeenSighting } from "../../../lib/map/kingdomPersistence";
import { persistKingdomCollapse } from "../../../lib/map/kingdomPersistence";
import {
  kingdomCardSubtreeIds,
  kingdomRelations,
  type NodeRelations,
} from "../../../lib/map/kingdomRelations";
import type {
  KingdomViewNode,
  LateralEdgeView,
  RecommendationPick,
} from "../../../lib/map/kingdomView";
import { useKingdomTree } from "./useKingdomTree";
import { type KingdomRef, useKingdomViewState } from "./useKingdomViewState";

export type { KingdomRef };

export interface KingdomModel {
  visibleNodes: VisibleTreeNode[];
  lateralEdges: LateralEdgeView[];
  primaryId: string | null;
  pinnedIds: ReadonlySet<string>;
  selectedId: string | null;
  setSelectedId(nodeId: string | null): void;
  setHoverId(nodeId: string | null): void;
  showAllEdges: boolean;
  setShowAllEdges(value: boolean): void;
  hasLateralEdges: boolean;
  recommendation: RecommendationPick;
  cardNode: KingdomViewNode | null;
  cardHasChildren: boolean;
  cardCollapsed: boolean;
  cardSubtreeIds: ReadonlySet<string>;
  relations: NodeRelations;
  lastSeen: LastSeenSighting | null;
  canGoToOrigin: boolean;
  opening: boolean;
  mainActionFor(node: KingdomViewNode): Promise<void>;
  enterNode(nodeId: string): Promise<void>;
  toggleCollapse(nodeId: string): void;
}

export function useKingdomModel(kingdom: KingdomRef) {
  const state = useKingdomViewState(kingdom);
  const tree = useKingdomTree(kingdom.memberNodeIds, state);

  const cardNodeId = state.selectedId ?? tree.primaryId;
  const cardNode = cardNodeId === null ? null : (tree.nodeById.get(cardNodeId) ?? null);

  const cardSubtreeIds = useMemo(
    () => kingdomCardSubtreeIds(cardNode, tree.viewNodes),
    [cardNode, tree.viewNodes],
  );
  const relations = useMemo(
    () => kingdomRelations(cardNode, tree.nodeById, tree.viewNodes, tree.edges),
    [cardNode, tree.nodeById, tree.viewNodes, tree.edges],
  );

  async function mainActionFor(actionNode: KingdomViewNode) {
    if (state.opening) return;
    state.setOpening(true);
    try {
      await startKingdomMainAction(actionNode, tree.recommendation.primary);
    } finally {
      state.setOpening(false);
    }
  }

  function toggleCollapse(nodeId: string) {
    const collapsed = new Set(state.manualCollapsed);
    const expanded = new Set(state.manualExpanded);
    const isCollapsed =
      tree.visibleNodes.find((node) => node.id === nodeId)?.collapsedCount !== null;
    if (isCollapsed) {
      collapsed.delete(nodeId);
      expanded.add(nodeId);
    } else {
      expanded.delete(nodeId);
      collapsed.add(nodeId);
    }
    state.setManual(collapsed, expanded);
    void persistKingdomCollapse(state.collapseKey, collapsed, expanded);
  }

  // Double-click on a station goes straight into it (Leo 2026-08-31 #3) — same action as
  // the card's main button, so the two entrances never diverge.
  async function enterNode(nodeId: string) {
    const node = tree.nodeById.get(nodeId);
    if (node === undefined) return;
    state.setSelectedId(nodeId);
    await mainActionFor(node);
  }

  const model: KingdomModel = {
    visibleNodes: tree.visibleNodes,
    lateralEdges: tree.lateralEdges,
    primaryId: tree.primaryId,
    pinnedIds: tree.pinnedIds,
    selectedId: state.selectedId,
    setSelectedId: state.setSelectedId,
    setHoverId: state.setHoverId,
    showAllEdges: state.showAllEdges,
    setShowAllEdges: state.setShowAllEdges,
    hasLateralEdges: tree.hasLateralEdges,
    recommendation: tree.recommendation,
    cardNode,
    cardHasChildren:
      cardNode !== null && tree.viewNodes.some((node) => node.parentId === cardNode.id),
    cardCollapsed:
      cardNode !== null &&
      tree.visibleNodes.find((node) => node.id === cardNode.id)?.collapsedCount !== null,
    cardSubtreeIds,
    relations,
    lastSeen: cardNode === null ? null : (state.lastSeenByNode.get(cardNode.id) ?? null),
    canGoToOrigin: cardNode !== null && state.originNodeIds.has(cardNode.id),
    opening: state.opening,
    mainActionFor,
    enterNode,
    toggleCollapse,
  };
  return { model, feedbackSources: state.feedbackSources };
}
