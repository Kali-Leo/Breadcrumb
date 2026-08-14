/**
 * Purpose: one conversation's station map (spec 040 §3) — fetches sightings + the exploration
 * atlas, builds the model and its pixel layout, and renders the SVG frame; per-mark rendering
 * lives in StationMapMarks.tsx. Click a visited station to locate it in chat, "续" to resume
 * from it, click an unvisited frontier stop to prefill a question about it.
 * Main exports: StationMap.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";
import type { ExplorationAtlas } from "@breadcrumb/plugin-explore";
import { EXPLORE_UI_COPY, frontierStopPrefill } from "@breadcrumb/plugin-explore";
import { useEffect, useMemo, useState } from "react";
import { loadAtlas } from "../lib/atlasData";
import { getRepos } from "../lib/db";
import { newestLeafId, pathToLeaf } from "../lib/messageTree";
import { layoutStationMap, MAIN_X, TOP_MARGIN } from "../lib/stationMapLayout";
import { buildStationMapModel } from "../lib/stationMapModel";
import { appEventBus, useChatStore } from "../stores/chatStore";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import { useMemoryStore } from "../stores/memoryStore";
import { BranchStubMark, FrontierStopMark, VisitedStationMark } from "./StationMapMarks";

const SVG_WIDTH = 232;
const LINE_STROKE = "#d6d3d1";

export function StationMap() {
  const conversationId = useChatStore((state) => state.activeConversationId);
  const allMessages = useChatStore((state) => state.allMessages);
  const currentLeafId = useChatStore((state) => state.currentLeafId);
  const nodes = useKnowledgeStore((state) => state.nodes);
  const retentionByNode = useMemoryStore((state) => state.retentionByNode);
  const [sightings, setSightings] = useState<readonly NodeSightingRow[]>([]);
  const [atlas, setAtlas] = useState<ExplorationAtlas | null>(null);

  useEffect(() => {
    if (conversationId === null) {
      setSightings([]);
      setAtlas(null);
      return;
    }
    let cancelled = false;
    async function refresh(id: string) {
      const repos = await getRepos();
      const [rows, loadedAtlas] = await Promise.all([
        repos.nodeSightings.listByConversation(id),
        loadAtlas(id),
      ]);
      if (cancelled) return;
      setSightings(rows);
      setAtlas(loadedAtlas);
    }
    void refresh(conversationId);
    const unsubscribe = appEventBus.on("chat:responseFinished", (payload) => {
      if (payload.conversationId === conversationId) void refresh(conversationId);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [conversationId]);

  const labelsByNode = useMemo(() => new Map(nodes.map((node) => [node.id, node.label])), [nodes]);

  const model = useMemo(
    () =>
      buildStationMapModel({
        rows: allMessages,
        currentLeafId,
        sightings,
        labelsByNode,
        retentionByNode,
        frontier: atlas?.frontier ?? [],
      }),
    [allMessages, currentLeafId, sightings, labelsByNode, retentionByNode, atlas],
  );

  const activePathIds = useMemo(() => {
    const leafId = currentLeafId ?? newestLeafId(allMessages);
    return leafId === null ? [] : pathToLeaf(allMessages, leafId).map((message) => message.id);
  }, [allMessages, currentLeafId]);

  const layout = useMemo(() => layoutStationMap(model, activePathIds), [model, activePathIds]);

  if (model.mainLine.length === 0) {
    return (
      <p className="px-2 py-4 text-xs text-stone-400">{EXPLORE_UI_COPY.stationMapEmptyLine}</p>
    );
  }

  function locate(messageId: string) {
    appEventBus.emit("chat:locateMessage", { messageId });
  }
  function resume(messageId: string) {
    useChatStore.getState().resumeFromMessage(messageId);
  }
  function askAbout(label: string) {
    appEventBus.emit("composer:prefill", { text: frontierStopPrefill(label) });
  }

  const mainLineTopY = layout.mainLine[0]?.y ?? TOP_MARGIN;
  const mainLineBottomY = layout.mainLine.at(-1)?.y ?? TOP_MARGIN;
  const frontierBottomY = layout.frontier.at(-1)?.y ?? mainLineBottomY;

  return (
    <div className="overflow-y-auto">
      <svg width={SVG_WIDTH} height={layout.height} role="img" aria-label="站点图">
        {layout.mainLine.length > 1 && (
          <line
            x1={MAIN_X}
            y1={mainLineTopY}
            x2={MAIN_X}
            y2={mainLineBottomY}
            stroke={LINE_STROKE}
            strokeWidth={1.2}
          />
        )}
        {layout.frontier.length > 0 && (
          <line
            x1={MAIN_X}
            y1={mainLineBottomY}
            x2={MAIN_X}
            y2={frontierBottomY}
            stroke={LINE_STROKE}
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        )}
        {layout.branches.map((laidOutBranch) => (
          <BranchStubMark
            key={laidOutBranch.branch.leafId}
            laidOutBranch={laidOutBranch}
            onLocate={locate}
            onResume={resume}
          />
        ))}
        {layout.mainLine.map((laidOutStation, index) => (
          <VisitedStationMark
            key={laidOutStation.station.nodeId}
            laidOut={laidOutStation}
            isCurrent={index === layout.mainLine.length - 1}
            onLocate={locate}
            onResume={resume}
          />
        ))}
        {layout.frontier.map(({ stop, x, y }) => (
          <FrontierStopMark
            key={stop.nodeId}
            x={x}
            y={y}
            label={stop.label}
            onAskAbout={askAbout}
          />
        ))}
      </svg>
    </div>
  );
}
