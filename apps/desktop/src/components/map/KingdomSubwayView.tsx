/**
 * Purpose: a kingdom's subway map (spec 048 §4, Leo's design) — the kingdom's knowledge
 * subtree drawn with the focus map's tidy-tree subway vocabulary: mastered stations amber
 * and filled, unknown stations grey, recommended stations ringed with a "可以从这里继续"
 * tag; clicking any station opens a context-seeded chat (zero LLM). The right rail carries
 * the kingdom name and the self-report card.
 * Main exports: KingdomSubwayView.
 */
import { LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import { useState } from "react";
import { layoutFocusMap } from "../../lib/focusMapLayout";
import { startFrontierSession } from "../../lib/frontierActions";
import { appEventBus, useChatStore } from "../../stores/chatStore";
import { usePlannerStore } from "../../stores/plannerStore";
import { SelfReportCard } from "./SelfReportCard";

const ACTIVE_COLOR = "#f59e0b";
const INACTIVE_DOT_COLOR = "#a8a29e";
const LINE_COLOR = "#d6d3d1";
const DOT_RADIUS = 5;
const LABEL_MAX_CHARS = 12;

export interface SubwayKingdom {
  nodeId: string;
  label: string;
  memberNodeIds: readonly string[];
}

interface KingdomSubwayViewProps {
  kingdom: SubwayKingdom;
  onClose(): void;
}

function truncateLabel(label: string): string {
  return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS)}…` : label;
}

export function KingdomSubwayView({ kingdom, onClose }: KingdomSubwayViewProps) {
  const nodes = usePlannerStore((state) => state.nodes);
  const masteryByNode = usePlannerStore((state) => state.masteryByNode);
  const frontierCandidates = usePlannerStore((state) => state.frontierCandidates);
  const [openingNodeId, setOpeningNodeId] = useState<string | null>(null);

  const memberSet = new Set(kingdom.memberNodeIds);
  const members = nodes.filter((node) => memberSet.has(node.id));
  const layout = layoutFocusMap(
    members.map((node) => ({
      id: node.id,
      label: node.label,
      kind: "word" as const,
      // Parents outside the kingdom fall away so the kingdom root anchors the tree.
      parentId: node.parent_id !== null && memberSet.has(node.parent_id) ? node.parent_id : null,
    })),
    "",
  );

  const recommendedById = new Map(
    frontierCandidates
      .filter((candidate) => memberSet.has(candidate.nodeId))
      .map((candidate) => [candidate.nodeId, candidate]),
  );

  async function open(nodeId: string, label: string) {
    setOpeningNodeId(nodeId);
    try {
      const litLabels = recommendedById.get(nodeId)?.reason.litPrerequisiteLabels ?? [];
      const conversationId = await startFrontierSession(label, litLabels);
      await useChatStore.getState().loadFromDatabase();
      appEventBus.emit("app:navigateChat", { conversationId });
    } finally {
      setOpeningNodeId(null);
    }
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
          <h2 className="text-sm font-semibold text-stone-700">{kingdom.label}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-stone-500 hover:bg-stone-100"
          >
            ← 回到岛屿
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-stone-50 p-4">
          {layout.stations.length === 0 ? (
            <p className="text-sm text-stone-400">这个国度还没有落座的知识点。</p>
          ) : (
            <svg
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              role="img"
              aria-label={`「${kingdom.label}」的知识地铁图`}
            >
              {layout.links.map((link) => (
                <polyline
                  key={link.points.map((point) => `${point.x},${point.y}`).join("-")}
                  points={link.points.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="none"
                  stroke={LINE_COLOR}
                  strokeWidth={1.2}
                />
              ))}
              {layout.stations.map((station) => {
                const lit = (masteryByNode.get(station.id) ?? 0) >= LIT_THRESHOLD;
                const recommended = recommendedById.has(station.id);
                const activate = () => void open(station.id, station.label);
                return (
                  // biome-ignore lint/a11y/useSemanticElements: SVG nodes cannot be <button> elements
                  <g
                    key={station.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`聊聊「${station.label}」`}
                    style={{ cursor: openingNodeId === null ? "pointer" : "wait" }}
                    onClick={activate}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") activate();
                    }}
                  >
                    {recommended && (
                      <circle
                        cx={station.x}
                        cy={station.y}
                        r={DOT_RADIUS + 3}
                        fill="none"
                        stroke={ACTIVE_COLOR}
                        strokeWidth={1.2}
                      />
                    )}
                    <circle
                      cx={station.x}
                      cy={station.y}
                      r={DOT_RADIUS}
                      fill={lit ? ACTIVE_COLOR : "white"}
                      stroke={lit ? ACTIVE_COLOR : INACTIVE_DOT_COLOR}
                      strokeWidth={1.2}
                    />
                    <text
                      x={station.x + 10}
                      y={station.y + 4}
                      fontSize={11}
                      fill={lit ? "#57534e" : "#78716c"}
                    >
                      {truncateLabel(station.label)}
                    </text>
                    {recommended && (
                      <text x={station.x + 10} y={station.y + 17} fontSize={9} fill={ACTIVE_COLOR}>
                        可以从这里继续
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
      <aside className="flex w-64 shrink-0 flex-col gap-4 border-l border-stone-200 bg-stone-50 p-4">
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="text-xs text-stone-400">国度</p>
          <p className="mt-0.5 text-base font-semibold text-stone-700">{kingdom.label}</p>
        </div>
        <SelfReportCard />
      </aside>
    </div>
  );
}
