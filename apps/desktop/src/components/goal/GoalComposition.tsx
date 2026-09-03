/**
 * Purpose: read-only chip list showing every knowledge node the selected goal maps to (spec
 * 017 §1 goal-decomposition display; re-homed by spec 047) — lit chips filled amber, unlit
 * chips outlined, and a small "新方向" dot on unlit chips with zero footprints ever. No
 * checkboxes, no actions.
 * Main exports: GoalComposition.
 */
import { LIT_THRESHOLD } from "@breadcrumb/feature-memory";
import { useTranslation } from "react-i18next";
import {
  goalSatisfiedNodeIds,
  goalNodeIds as parseGoalNodeIds,
} from "../../lib/planner/plannerGapActions";
import { usePlannerStore } from "../../stores/plannerStore";

export function GoalComposition() {
  const { t } = useTranslation("palace");
  const goals = usePlannerStore((state) => state.goals);
  const selectedGoalId = usePlannerStore((state) => state.selectedGoalId);
  const nodes = usePlannerStore((state) => state.nodes);
  const masteryByNode = usePlannerStore((state) => state.masteryByNode);
  const claims = usePlannerStore((state) => state.claims);
  const sightedNodeIds = usePlannerStore((state) => state.sightedNodeIds);

  const goal = goals.find((candidate) => candidate.id === selectedGoalId);
  if (goal === undefined) return null;

  const goalNodeIds = parseGoalNodeIds(goal);
  if (goalNodeIds.length === 0) return null;

  // Same goal-local belief coverage() applies — a chip must never disagree with what the rest
  // of the goal UI already calls "lit".
  const satisfiedNodeIds = goalSatisfiedNodeIds(claims);
  const labelById = new Map(nodes.map((node) => [node.id, node.label]));

  return (
    <div className="space-y-1">
      <p className="text-stone-500">{t("goal.compositionCount", { count: goalNodeIds.length })}</p>
      <ul className="flex flex-wrap gap-1">
        {goalNodeIds.map((nodeId) => {
          const lit =
            satisfiedNodeIds.has(nodeId) || (masteryByNode.get(nodeId) ?? 0) >= LIT_THRESHOLD;
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
                <>
                  {/* The dot's meaning lives in its tooltip, and a finger cannot open one —
                      so on a touch screen the words stand there instead of the dot. */}
                  <span
                    title={t("goal.compositionNewDirection")}
                    className="ms-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle coarse:hidden"
                  />
                  <span className="ms-1 hidden text-[10px] text-amber-600 coarse:inline">
                    {t("goal.compositionNewDirection")}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
