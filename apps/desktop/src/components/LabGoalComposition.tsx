/**
 * Purpose: read-only chip list showing every knowledge node the selected goal maps to (spec
 * 017 §1 goal-decomposition display) — lit chips filled amber, unlit chips outlined, and a
 * small "新方向" dot on unlit chips with zero footprints ever. No checkboxes, no actions.
 * Main exports: LabGoalComposition.
 */
import { LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import { masteryAsSeenByGoal } from "../lib/plannerGapActions";
import { usePlannerStore } from "../stores/plannerStore";

export function LabGoalComposition() {
  const goals = usePlannerStore((state) => state.goals);
  const selectedGoalId = usePlannerStore((state) => state.selectedGoalId);
  const nodes = usePlannerStore((state) => state.nodes);
  const masteryByNode = usePlannerStore((state) => state.masteryByNode);
  const claims = usePlannerStore((state) => state.claims);
  const sightedNodeIds = usePlannerStore((state) => state.sightedNodeIds);

  const goal = goals.find((candidate) => candidate.id === selectedGoalId);
  if (goal === undefined) return null;

  const goalNodeIds = JSON.parse(goal.node_ids_json) as string[];
  if (goalNodeIds.length === 0) return null;

  // Same goal-view-boosted mastery coverage()/the ladder use — a chip must never disagree
  // with what the rest of the goal UI already calls "lit".
  const goalMasteryByNode = masteryAsSeenByGoal(masteryByNode, claims);
  const labelById = new Map(nodes.map((node) => [node.id, node.label]));

  return (
    <div className="space-y-1">
      <p className="text-stone-500">这个目标包含 {goalNodeIds.length} 个知识点</p>
      <ul className="flex flex-wrap gap-1">
        {goalNodeIds.map((nodeId) => {
          const lit = (goalMasteryByNode.get(nodeId) ?? 0) >= LIT_THRESHOLD;
          // Whether a node arrived via THIS goal's own suggestions isn't persisted anywhere
          // (persistCalibratedGoal doesn't tag suggested-vs-existing after insert) — a node
          // that's still unlit and has never once been sighted in a real conversation
          // approximates that origin closely enough for a quiet hint dot (2026-08-04, Leo's
          // goal-decomposition display bullet; an approximation, not ground truth).
          const isNewDirection = !lit && !sightedNodeIds.has(nodeId);
          return (
            <li
              key={nodeId}
              className={`rounded px-1.5 py-0.5 ${
                lit ? "bg-amber-100 text-stone-700" : "border border-stone-200 text-stone-500"
              }`}
            >
              {labelById.get(nodeId) ?? nodeId}
              {isNewDirection && (
                <span
                  title="新方向"
                  className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
