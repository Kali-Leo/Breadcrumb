/**
 * Purpose: the goal overlay's full-lab-area view (spec 017 #2, ADR-0013) — top bar (milestone/
 * band in ranked mode + 已点亮 N / 目标 M), the force-directed graph itself (react-force-graph-2d
 * painting the ghost/goal underlay + solid/owned overlay per node), the next-step hook line, a
 * hover tooltip, and a click action bar reusing plannerStore's self-statement actions. Assembles
 * OverlayModelInput from plannerStore's already-loaded state; no data fetching of its own.
 * Main exports: GoalOverlayView.
 */
import { DIM_THRESHOLD, LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import { milestone } from "@breadcrumb/plugin-planner";
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { computeOverlayLayout, type OverlayLayoutNode } from "../../lib/overlayLayout";
import { buildOverlayModel, type OverlayEdge } from "../../lib/overlayModel";
import {
  paintOverlayLink,
  paintOverlayNode,
  paintOverlayNodePointerArea,
} from "../../lib/overlayPainters";
import { masteryAsSeenByGoal } from "../../lib/plannerGapActions";
import { useLabUiStore } from "../../stores/labUiStore";
import { usePlannerStore } from "../../stores/plannerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { OverlayNodeActions } from "./OverlayNodeActions";
import { OverlayNodeTooltip } from "./OverlayNodeTooltip";

/** String-valued canvas-object-mode props are silently dropped somewhere in the
 * react-kapsule prop chain (verified live 2026-08-04); a constant accessor fn works. */
const REPLACE_MODE = () => "replace" as const;

const ZOOM_TO_FIT_DURATION_MS = 400;
const ZOOM_TO_FIT_PADDING = 40;

/** Tracks the graph container's box so ForceGraph2D always fills it (the library takes explicit
 * width/height, it doesn't auto-fill a parent). */
function useContainerSize(): [
  React.RefObject<HTMLDivElement | null>,
  { width: number; height: number },
] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

export function GoalOverlayView() {
  const closeOverlay = useLabUiStore((state) => state.closeOverlay);
  const learningMode = useSettingsStore((state) => state.learningMode);
  const goals = usePlannerStore((state) => state.goals);
  const selectedGoalId = usePlannerStore((state) => state.selectedGoalId);
  const nodes = usePlannerStore((state) => state.nodes);
  const edges = usePlannerStore((state) => state.edges);
  const claims = usePlannerStore((state) => state.claims);
  const masteryByNode = usePlannerStore((state) => state.masteryByNode);
  const interestByNode = usePlannerStore((state) => state.interestByNode);
  const interestScoresByNode = usePlannerStore((state) => state.interestScoresByNode);
  const route = usePlannerStore((state) => state.route);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [clickedNodeId, setClickedNodeId] = useState<string | null>(null);
  const [containerRef, containerSize] = useContainerSize();
  const graphRef = useRef<ForceGraphMethods<OverlayLayoutNode, OverlayEdge> | undefined>(undefined);

  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? null;
  const goalNodeIds = useMemo(
    () => (selectedGoal === null ? [] : (JSON.parse(selectedGoal.node_ids_json) as string[])),
    [selectedGoal],
  );
  const goalMasteryByNode = useMemo(
    () => masteryAsSeenByGoal(masteryByNode, claims),
    [masteryByNode, claims],
  );
  const evidenceWeightByNode = useMemo(
    () => new Map([...interestScoresByNode].map(([id, score]) => [id, score.evidenceWeight])),
    [interestScoresByNode],
  );

  const model = useMemo(() => {
    if (selectedGoal === null) return null;
    return buildOverlayModel({
      goalNodeIds,
      nodes,
      edges,
      goalMasteryByNode,
      interestByNode,
      evidenceWeightByNode,
      route,
      litThreshold: LIT_THRESHOLD,
      dimThreshold: DIM_THRESHOLD,
    });
  }, [
    selectedGoal,
    goalNodeIds,
    nodes,
    edges,
    goalMasteryByNode,
    interestByNode,
    evidenceWeightByNode,
    route,
  ]);

  // The node/edge *set* — not node state (mastery/route can change every recompute without the
  // scope changing). The expensive d3-force layout below is keyed on this, not on `model`
  // itself, so claiming/skipping a node redraws colors without ever re-running or jittering
  // positions.
  const scopeSignature = useMemo(() => {
    if (model === null) return null;
    const nodeKey = model.nodes
      .map((node) => node.id)
      .sort()
      .join(",");
    const edgeKey = model.edges
      .map((edge) => `${edge.source}>${edge.target}:${edge.type}`)
      .sort()
      .join(",");
    return `${nodeKey}|${edgeKey}`;
  }, [model]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: layout is frozen by design — it must only recompute when scopeSignature (the node/edge set) changes, never on a state-only model update
  const frozenPositionById = useMemo(() => {
    if (model === null) return new Map<string, Pick<OverlayLayoutNode, "x" | "y" | "fx" | "fy">>();
    const layout = computeOverlayLayout(model.nodes, model.edges);
    return new Map(
      layout.nodes.map((node) => [node.id, { x: node.x, y: node.y, fx: node.fx, fy: node.fy }]),
    );
  }, [scopeSignature]);

  const graphData = useMemo(() => {
    if (model === null) return { nodes: [] as OverlayLayoutNode[], links: [] as OverlayEdge[] };
    const graphNodes: OverlayLayoutNode[] = model.nodes.map((node) => {
      const position = frozenPositionById.get(node.id) ?? { x: 0, y: 0, fx: 0, fy: 0 };
      return { ...node, ...position };
    });
    return { nodes: graphNodes, links: model.edges };
  }, [model, frozenPositionById]);

  useEffect(() => {
    // Refit whenever the scope OR the container size settles — a fit attempted while the
    // ResizeObserver still reports 0×0 (first mount) silently fits an empty viewport.
    if (scopeSignature === null || containerSize.width === 0 || containerSize.height === 0) return;
    const timer = setTimeout(() => {
      graphRef.current?.zoomToFit(ZOOM_TO_FIT_DURATION_MS, ZOOM_TO_FIT_PADDING);
    }, 120);
    return () => clearTimeout(timer);
  }, [scopeSignature, containerSize.width, containerSize.height]);

  if (selectedGoal === null || model === null) {
    closeOverlay();
    return null;
  }

  const litCount = model.nodes.filter((node) => node.state === "lit").length;
  const milestoneValue = milestone(goalNodeIds, goalMasteryByNode, LIT_THRESHOLD, DIM_THRESHOLD);
  const hoveredNode = model.nodes.find((node) => node.id === hoveredNodeId) ?? null;
  const clickedNode = model.nodes.find((node) => node.id === clickedNodeId) ?? null;
  const nextStepLabel = route?.[0]?.label ?? null;

  return (
    <div className="flex h-full flex-col bg-stone-50">
      <div className="flex items-center justify-between border-stone-200 border-b px-4 py-2 text-xs">
        <div className="flex items-center gap-3 text-stone-600">
          <span className="font-semibold">{selectedGoal.title} · 对照</span>
          {learningMode === "ranked" && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
              目标进度 {milestoneValue}%
            </span>
          )}
          <span className="text-stone-400">
            已点亮 {litCount} / 目标 {model.nodes.length}
          </span>
        </div>
        <button
          type="button"
          onClick={closeOverlay}
          className="rounded border border-stone-200 px-2 py-0.5 text-stone-500 transition-colors hover:border-amber-400 hover:text-amber-700"
        >
          关闭
        </button>
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: tracks pointer position for the hover tooltip only — node interactivity itself is canvas-drawn (ForceGraph2D's onNodeHover/onNodeClick), not a DOM control this div could semantically become */}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1"
        onMouseMove={(event) => setHoverPosition({ x: event.clientX, y: event.clientY })}
      >
        {containerSize.width > 0 && containerSize.height > 0 && (
          <ForceGraph2D<OverlayLayoutNode, OverlayEdge>
            ref={graphRef}
            graphData={graphData}
            width={containerSize.width}
            height={containerSize.height}
            backgroundColor="#fafaf9"
            cooldownTicks={0}
            autoPauseRedraw={false}
            nodeCanvasObjectMode={REPLACE_MODE}
            nodeCanvasObject={(node, ctx) => paintOverlayNode(ctx, node, node.id === hoveredNodeId)}
            nodePointerAreaPaint={(node, color, ctx) =>
              paintOverlayNodePointerArea(node, color, ctx)
            }
            linkCanvasObjectMode={REPLACE_MODE}
            linkCanvasObject={(link, ctx) => {
              // Before force-graph finishes ingesting graphData, link endpoints are still raw
              // id strings; resolve either shape and skip the frame when a node isn't ready.
              const resolve = (end: unknown): OverlayLayoutNode | undefined =>
                typeof end === "object" && end !== null
                  ? (end as OverlayLayoutNode)
                  : graphData.nodes.find((candidate) => candidate.id === end);
              const source = resolve(link.source);
              const target = resolve(link.target);
              if (source === undefined || target === undefined) return;
              if (source.x === undefined || target.x === undefined) return;
              paintOverlayLink(ctx, link, source, target);
            }}
            onNodeHover={(node) => setHoveredNodeId(node === null ? null : node.id)}
            onNodeClick={(node) => setClickedNodeId(node.id)}
            onBackgroundClick={() => setClickedNodeId(null)}
          />
        )}

        {hoveredNode && hoverPosition && (
          <OverlayNodeTooltip node={hoveredNode} position={hoverPosition} />
        )}

        {nextStepLabel !== null && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-white/90 px-2 py-1 text-stone-600 text-xs shadow-sm">
            下一步：「{nextStepLabel}」
          </div>
        )}
      </div>

      {clickedNode && (
        <OverlayNodeActions node={clickedNode} onClose={() => setClickedNodeId(null)} />
      )}
    </div>
  );
}
