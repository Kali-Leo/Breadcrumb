/**
 * Purpose: the third zoom level's container (spec 049) — assembles the kingdom's local
 * network view model from planner data, keeps selection/hover/collapse state (manual
 * collapse persisted per kingdom), and wires the two-stage card's main actions: start a
 * context-seeded chat, continue the last conversation that met the concept, or open a
 * teach-back for a done one. Rendering lives in KingdomTreeSvg/KingdomNodeCard.
 * Main exports: KingdomView, KingdomRef.
 */
import { LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import { useEffect, useMemo, useState } from "react";
import {
  appendCompanionInvitation,
  openCompanionConversation,
  seedTeachScriptForConversation,
} from "../../../lib/companionActions";
import { getRepos } from "../../../lib/db";
import { startFrontierSession } from "../../../lib/frontierActions";
import {
  computeVisibleTree,
  deriveKingdomNodes,
  pickRecommendation,
  visibleLateralEdges,
} from "../../../lib/kingdomView";
import { startTeachSession } from "../../../lib/teachActions";
import { nowIso } from "../../../lib/time";
import { appEventBus, useChatStore } from "../../../stores/chatStore";
import { usePlannerStore } from "../../../stores/plannerStore";
import { useSettingsStore } from "../../../stores/settingsStore";
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

function plainDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function KingdomView({ kingdom, onClose }: KingdomViewProps) {
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
    const goalIds = JSON.parse(goal.node_ids_json) as string[];
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

  const cardNodeId = selectedId ?? primaryId;
  const cardNode = cardNodeId === null ? null : (nodeById.get(cardNodeId) ?? null);

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

  async function mainAction() {
    if (cardNode === null) return;
    setOpening(true);
    try {
      if (cardNode.state === "visited") {
        const lastSeen = lastSeenByNode.get(cardNode.id);
        if (lastSeen !== undefined) {
          appEventBus.emit("app:navigateChat", { conversationId: lastSeen.conversationId });
          return;
        }
      }
      let conversationId: string;
      if (cardNode.state === "done") {
        // 用户主动讲的功能一律走伙伴（Leo 铁律）：Shichimi 发出邀请并提前备课，讲解
        // 发生在她的对话里。伙伴开关关闭时退回匿名教学会话，能力不消失。
        if (useSettingsStore.getState().featureSwitches.companionChat) {
          conversationId = await openCompanionConversation("shichimi");
          await appendCompanionInvitation("shichimi", cardNode.label, "teach");
          await seedTeachScriptForConversation(
            conversationId,
            cardNode.label,
            nodes.map((node) => node.label),
          );
        } else {
          conversationId = await startTeachSession(cardNode.label);
        }
      } else {
        conversationId = await startFrontierSession(
          cardNode.label,
          recommendation.primary?.nodeId === cardNode.id
            ? recommendation.primary.reason.litPrerequisiteLabels
            : [],
        );
      }
      await useChatStore.getState().loadFromDatabase();
      appEventBus.emit("app:navigateChat", { conversationId });
    } finally {
      setOpening(false);
    }
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

  function scrollToPrimary() {
    if (primaryId === null) return;
    document
      .querySelector(`[data-station-id="${primaryId}"]`)
      ?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-2">
          <h2 className="text-sm font-semibold text-stone-700">{kingdom.label}</h2>
          {primaryId !== null && (
            <button
              type="button"
              onClick={scrollToPrimary}
              className="rounded border border-amber-400 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-50"
            >
              去下一步
            </button>
          )}
          <label className="flex items-center gap-1 text-xs text-stone-500">
            <input
              type="checkbox"
              checked={showAllEdges}
              onChange={(event) => setShowAllEdges(event.target.checked)}
            />
            显示全部关系
          </label>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg px-3 py-1.5 text-xs text-stone-500 hover:bg-stone-100"
          >
            ← 回到岛屿
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-stone-50 p-4">
          <KingdomTreeSvg
            visibleNodes={visibleNodes}
            lateralEdges={lateralEdges}
            primaryId={primaryId}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onHover={setHoverId}
            onExpandAggregate={toggleCollapse}
          />
        </div>
      </div>
      <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-stone-200 bg-stone-50 p-4">
        {recommendation.regionDone && (
          <p className="rounded-xl bg-white p-3 text-xs text-stone-500 shadow-sm">
            这片区域已完成。
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
                ? plainDate((lastSeenByNode.get(cardNode.id) as { createdAt: string }).createdAt)
                : null
            }
            relations={relations}
            opening={opening}
            hasChildren={viewNodes.some((node) => node.parentId === cardNode.id)}
            collapsed={
              visibleNodes.find((node) => node.id === cardNode.id)?.collapsedCount !== null
            }
            onJump={setSelectedId}
            onMainAction={() => void mainAction()}
            onToggleCollapse={() => toggleCollapse(cardNode.id)}
          />
        )}
      </aside>
    </div>
  );
}
