/**
 * Purpose: the goal overlay's full-lab-area view (spec 017 #2) — top bar (milestone/band in
 * ranked mode + 已点亮 N / 目标 M), the SVG overlay canvas, a hover tooltip, and a click action
 * bar reusing plannerStore's self-statement actions. Assembles OverlayModelInput from
 * plannerStore's already-loaded state; no data fetching of its own.
 * Main exports: GoalOverlayView.
 */
import { DIM_THRESHOLD, LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import { milestone } from "@breadcrumb/plugin-planner";
import { useMemo, useState } from "react";
import { buildOverlayModel } from "../../lib/overlayModel";
import { masteryAsSeenByGoal } from "../../lib/plannerGapActions";
import { useLabUiStore } from "../../stores/labUiStore";
import { usePlannerStore } from "../../stores/plannerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { OverlayCanvas } from "./OverlayCanvas";
import { OverlayNodeActions } from "./OverlayNodeActions";
import { OverlayNodeTooltip } from "./OverlayNodeTooltip";

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

  if (selectedGoal === null || model === null) {
    closeOverlay();
    return null;
  }

  const litCount = model.nodes.filter((node) => node.state === "lit").length;
  const milestoneValue = milestone(goalNodeIds, goalMasteryByNode, LIT_THRESHOLD, DIM_THRESHOLD);
  const hoveredNode = model.nodes.find((node) => node.id === hoveredNodeId) ?? null;
  const clickedNode = model.nodes.find((node) => node.id === clickedNodeId) ?? null;

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

      <div className="relative min-h-0 flex-1 overflow-auto p-6">
        <OverlayCanvas
          model={model}
          hoveredNodeId={hoveredNodeId}
          onHoverNode={(nodeId, event) => {
            setHoveredNodeId(nodeId);
            setHoverPosition(event === null ? null : { x: event.clientX, y: event.clientY });
          }}
          onClickNode={setClickedNodeId}
        />
        {hoveredNode && hoverPosition && (
          <OverlayNodeTooltip node={hoveredNode} position={hoverPosition} />
        )}
      </div>

      {clickedNode && (
        <OverlayNodeActions node={clickedNode} onClose={() => setClickedNodeId(null)} />
      )}
    </div>
  );
}
