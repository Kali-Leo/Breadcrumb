/**
 * Purpose: the third zoom level's container (spec 049) — assembles the kingdom's local
 * network view model from planner data, keeps selection/hover/collapse state (manual
 * collapse persisted per kingdom), and wires the two-stage card's main actions: start a
 * context-seeded chat, continue the last conversation that met the concept, or open a
 * teach-back for a done one. Rendering lives in KingdomTreeSvg/KingdomNodeCard.
 * Main exports: KingdomView, KingdomRef.
 */

import { formatDayMonth } from "@breadcrumb/core-i18n";
import { COMPANION_COPY } from "@breadcrumb/plugin-companion";
import { LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import { visibleFrontier } from "@breadcrumb/plugin-planner";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getRepos } from "../../../lib/db";
import { startLearningForConcept } from "../../../lib/focusLearning";
import {
  computeVisibleTree,
  deriveKingdomNodes,
  type KingdomViewNode,
  pickRecommendation,
  visibleLateralEdges,
} from "../../../lib/kingdomView";
import { goalNodeIds as parseGoalNodeIds } from "../../../lib/plannerGapActions";
import {
  loadRegionFeedbackSources,
  type RegionFeedbackSources,
} from "../../../lib/regionFeedbackData";
import { startTeachSession } from "../../../lib/teachActions";
import { nowIso } from "../../../lib/time";
import { appEventBus, useChatStore } from "../../../stores/chatStore";
import { usePlannerStore } from "../../../stores/plannerStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { BackArrow } from "../../DirectionalArrow";
import { RegionMirror } from "../RegionMirror";
import { KingdomNodeCard, type NodeRelations } from "./KingdomNodeCard";
import { KingdomTreeSvg } from "./KingdomTreeSvg";

export interface KingdomRef {
  nodeId: string;
  label: string;
  memberNodeIds: readonly string[];
}

interface KingdomViewProps {
  kingdom: KingdomRef;
  onClose(): void;
}

interface CollapsePersist {
  collapsed: string[];
  expanded: string[];
}

function plainDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : formatDayMonth(locale, date);
}

export function KingdomView({ kingdom, onClose }: KingdomViewProps) {
  const { t, i18n } = useTranslation("palace");
  const nodes = usePlannerStore((state) => state.nodes);
  const edges = usePlannerStore((state) => state.edges);
  const masteryByNode = usePlannerStore((state) => state.masteryByNode);
  const sightedNodeIds = usePlannerStore((state) => state.sightedNodeIds);
  const frontierCandidates = usePlannerStore((state) => state.frontierCandidates);
  const goals = usePlannerStore((state) => state.goals);
  const selectedGoalId = usePlannerStore((state) => state.selectedGoalId);
  const learningMode = useSettingsStore((state) => state.learningMode);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [showAllEdges, setShowAllEdges] = useState(false);
  const [opening, setOpening] = useState(false);
  const [manualCollapsed, setManualCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [manualExpanded, setManualExpanded] = useState<ReadonlySet<string>>(new Set());
  const [lastSeenByNode, setLastSeenByNode] = useState(
    new Map<string, { conversationId: string; createdAt: string }>(),
  );
  const [feedbackSources, setFeedbackSources] = useState<RegionFeedbackSources | null>(null);
  /** Concepts with a surviving message behind them — the only ones the "back to where this
   * was learned" link can be offered for. */
  const [originNodeIds, setOriginNodeIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void loadRegionFeedbackSources().then((data) => {
      if (!cancelled) setFeedbackSources(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const collapseKey = `kingdomView:${kingdom.nodeId}`;

  useEffect(() => {
    void (async () => {
      const repos = await getRepos();
      const stored = await repos.settings.get<CollapsePersist>(collapseKey);
      if (stored !== null) {
        setManualCollapsed(new Set(stored.collapsed));
        setManualExpanded(new Set(stored.expanded));
      }
      const memberSet = new Set(kingdom.memberNodeIds);
      const sightings = await repos.nodeSightings.listAll();
      const latest = new Map<string, { conversationId: string; createdAt: string }>();
      for (const sighting of sightings) {
        if (!memberSet.has(sighting.node_id)) continue;
        const current = latest.get(sighting.node_id);
        if (current === undefined || sighting.created_at > current.createdAt) {
          latest.set(sighting.node_id, {
            conversationId: sighting.conversation_id,
            createdAt: sighting.created_at,
          });
        }
      }
      setLastSeenByNode(latest);
      // Same pass answers "is there a conversation to go back to": a footprint that still
      // names a message. Cheap here, and it keeps the card from offering a dead link.
      setOriginNodeIds(
        new Set(
          sightings
            .filter((sighting) => memberSet.has(sighting.node_id) && sighting.message_id !== null)
            .map((sighting) => sighting.node_id),
        ),
      );
    })();
  }, [collapseKey, kingdom.memberNodeIds]);

  async function persistCollapse(collapsed: ReadonlySet<string>, expanded: ReadonlySet<string>) {
    const repos = await getRepos();
    await repos.settings.set(
      collapseKey,
      { collapsed: [...collapsed], expanded: [...expanded] },
      nowIso(),
    );
  }

  const memberSet = useMemo(() => new Set(kingdom.memberNodeIds), [kingdom.memberNodeIds]);
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
        manualCollapsedIds: manualCollapsed,
        manualExpandedIds: manualExpanded,
      }),
    [viewNodes, primaryId, manualCollapsed, manualExpanded],
  );
  const lateralEdges = useMemo(
    () =>
      visibleLateralEdges({
        edges,
        visibleIds: new Set(visibleNodes.map((node) => node.id)),
        nextNodeId: primaryId,
        focusNodeId: selectedId ?? hoverId,
        showAll: showAllEdges,
      }),
    [edges, visibleNodes, primaryId, selectedId, hoverId, showAllEdges],
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

  const cardNodeId = selectedId ?? primaryId;
  const cardNode = cardNodeId === null ? null : (nodeById.get(cardNodeId) ?? null);

  // The mirror reads the selected concept AND everything under it — a branch is one topic.
  const cardSubtreeIds = useMemo(() => {
    if (cardNode === null) return new Set<string>();
    const childrenByParent = new Map<string | null, KingdomViewNode[]>();
    for (const node of viewNodes) {
      const list = childrenByParent.get(node.parentId) ?? [];
      list.push(node);
      childrenByParent.set(node.parentId, list);
    }
    const collected = new Set<string>();
    const queue = [cardNode.id];
    while (queue.length > 0) {
      const id = queue.pop();
      if (id === undefined || collected.has(id)) continue;
      collected.add(id);
      for (const child of childrenByParent.get(id) ?? []) queue.push(child.id);
    }
    return collected;
  }, [cardNode, viewNodes]);

  const relations: NodeRelations = useMemo(() => {
    if (cardNode === null) return { parent: null, children: [], prerequisites: [], helpers: [] };
    const label = (id: string) => nodeById.get(id)?.label ?? id;
    const inSet = (id: string) => nodeById.has(id);
    return {
      parent:
        cardNode.parentId === null
          ? null
          : { id: cardNode.parentId, label: label(cardNode.parentId) },
      children: viewNodes
        .filter((node) => node.parentId === cardNode.id)
        .map((node) => ({ id: node.id, label: node.label })),
      prerequisites: edges
        .filter(
          (e) => e.target_id === cardNode.id && e.edge_type === "requires" && inSet(e.source_id),
        )
        .map((e) => ({ id: e.source_id, label: label(e.source_id) })),
      helpers: edges
        .filter((e) => e.target_id === cardNode.id && e.edge_type === "helps" && inSet(e.source_id))
        .map((e) => ({ id: e.source_id, label: label(e.source_id) })),
    };
  }, [cardNode, nodeById, viewNodes, edges]);

  async function mainActionFor(actionNode: KingdomViewNode) {
    if (opening) return;
    setOpening(true);
    try {
      if (actionNode.state === "done") {
        // 用户主动讲=讲给一位求教的同学听（Leo 铁律，spec 050 §9 的临时求教者形态）；
        // 对话在弹窗里进行，主界面不被占据。伙伴开关关闭时退回主界面对话形态。
        const conversationId = await startTeachSession(actionNode.label);
        await useChatStore.getState().loadFromDatabase();
        if (useSettingsStore.getState().featureSwitches.companionChat) {
          appEventBus.emit("companion:openPopup", {
            conversationId,
            title: COMPANION_COPY.helperName(actionNode.label),
          });
        } else {
          appEventBus.emit("app:navigateChat", { conversationId });
        }
        return;
      }
      // 开始学习/继续都直进专注模式，AI 立刻开讲（spec 050 §2）；退出后落回宫殿。
      const result = await startLearningForConcept(
        actionNode.label,
        recommendation.primary?.nodeId === actionNode.id
          ? recommendation.primary.reason.litPrerequisiteLabels
          : [],
        useSettingsStore.getState().featureSwitches.focusExplain,
      );
      if (result.mode === "chat") {
        await useChatStore.getState().loadFromDatabase();
        appEventBus.emit("app:navigateChat", { conversationId: result.conversationId });
      }
    } finally {
      setOpening(false);
    }
  }

  /**
   * Back to where this concept was first met (spec 005 §5, backlog "溯源跳转"): open that
   * conversation and scroll to the exchange itself. Silent when there is nothing to go back
   * to — the conversation was deleted, or the concept arrived without a message behind it.
   */
  async function goToOrigin(nodeId: string): Promise<void> {
    const repos = await getRepos();
    const sighting = await repos.nodeSightings.firstWithMessage(nodeId);
    if (sighting === null || sighting.message_id === null) return;
    await useChatStore.getState().openConversation(sighting.conversation_id);
    appEventBus.emit("app:navigateChat", { conversationId: sighting.conversation_id });
    appEventBus.emit("chat:locateMessage", { messageId: sighting.message_id });
  }

  function toggleCollapse(nodeId: string) {
    const collapsed = new Set(manualCollapsed);
    const expanded = new Set(manualExpanded);
    const isCollapsed = visibleNodes.find((node) => node.id === nodeId)?.collapsedCount !== null;
    if (isCollapsed) {
      collapsed.delete(nodeId);
      expanded.add(nodeId);
    } else {
      expanded.delete(nodeId);
      collapsed.add(nodeId);
    }
    setManualCollapsed(collapsed);
    setManualExpanded(expanded);
    void persistCollapse(collapsed, expanded);
  }

  // Double-click on a station goes straight into it (Leo 2026-08-31 #3) — same action as
  // the card's main button, so the two entrances never diverge.
  async function enterNode(nodeId: string) {
    const node = nodeById.get(nodeId);
    if (node === undefined) return;
    setSelectedId(nodeId);
    await mainActionFor(node);
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-2">
          {/* Back sits on the left, icon only — the arrow is the whole vocabulary
              (Leo 2026-08-31 #5); the label survives as the accessible name. */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("kingdom.backToIsland")}
            title={t("kingdom.backToIsland")}
            className="rounded-lg px-2 py-1.5 text-stone-500 hover:bg-stone-100"
          >
            <BackArrow />
          </button>
          <h2 className="text-sm font-semibold text-stone-700">{kingdom.label}</h2>
          {hasLateralEdges && (
            <label
              className="ms-auto flex items-center gap-1 text-xs text-stone-500"
              title={t("kingdom.relationHint")}
            >
              <input
                type="checkbox"
                checked={showAllEdges}
                onChange={(event) => setShowAllEdges(event.target.checked)}
              />
              {t("kingdom.showAllRelations")}
            </label>
          )}
        </div>
        <div className="min-h-0 flex-1 bg-stone-50">
          <KingdomTreeSvg
            visibleNodes={visibleNodes}
            lateralEdges={lateralEdges}
            primaryId={primaryId}
            pinnedIds={pinnedIds}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onEnter={(nodeId) => void enterNode(nodeId)}
            onHover={setHoverId}
            onExpandAggregate={toggleCollapse}
          />
        </div>
      </div>
      <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-s border-stone-200 bg-stone-50 p-4">
        {recommendation.regionDone && (
          <p className="rounded-xl bg-white p-3 text-xs text-stone-500 shadow-sm">
            {t("kingdom.areaDone")}
          </p>
        )}
        {cardNode !== null && (
          <KingdomNodeCard
            node={cardNode}
            isPrimary={cardNode.id === primaryId}
            candidate={recommendation.primary}
            alternates={recommendation.alternates}
            lastSeenDate={
              lastSeenByNode.has(cardNode.id)
                ? plainDate(
                    (lastSeenByNode.get(cardNode.id) as { createdAt: string }).createdAt,
                    i18n.language,
                  )
                : null
            }
            relations={relations}
            opening={opening}
            hasChildren={viewNodes.some((node) => node.parentId === cardNode.id)}
            collapsed={
              visibleNodes.find((node) => node.id === cardNode.id)?.collapsedCount !== null
            }
            onJump={setSelectedId}
            onMainAction={() => void mainActionFor(cardNode)}
            onToggleCollapse={() => toggleCollapse(cardNode.id)}
            onGoToOrigin={
              originNodeIds.has(cardNode.id) ? () => void goToOrigin(cardNode.id) : null
            }
          />
        )}
        {/* Same mirror as the island level (Leo 2026-08-31 #6): the selected concept and
            everything under it, heatmap + trend curves. */}
        {cardNode !== null && (
          <RegionMirror
            title={cardNode.label}
            memberCount={cardSubtreeIds.size}
            nodeIds={cardSubtreeIds}
            sources={feedbackSources}
          />
        )}
      </aside>
    </div>
  );
}
