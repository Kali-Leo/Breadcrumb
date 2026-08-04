/**
 * Purpose: lab-panel goal section — free-text goal to LLM mapping (persisted immediately, no
 * calibration step), a goal picker, the read-only goal-decomposition chip list (spec 017 §1),
 * the single recommended route (spec 017 #1, tunable via two sliders) with a coverage
 * fraction, and per-node self-statement actions for the gap. Copy is suggest-only ("可以学"),
 * never "behind" or "missing" (product principle 1).
 * Main exports: LabGoalSection.
 */
import { useState } from "react";
import { useLabUiStore } from "../stores/labUiStore";
import { usePlannerStore } from "../stores/plannerStore";
import { LabGoalComposition } from "./LabGoalComposition";
import { LabGoalGapActions } from "./LabGoalGapActions";
import { LabGoalMappingForm } from "./LabGoalMappingForm";
import { LabGoalRoute } from "./LabGoalRoute";

export function LabGoalSection() {
  const goals = usePlannerStore((state) => state.goals);
  const selectedGoalId = usePlannerStore((state) => state.selectedGoalId);
  const selectGoal = usePlannerStore((state) => state.selectGoal);
  const openOverlay = useLabUiStore((state) => state.openOverlay);

  const [goalText, setGoalText] = useState("");

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-stone-600">学习目标</h3>
        {selectedGoalId !== null && (
          <button
            type="button"
            onClick={openOverlay}
            className="rounded border border-amber-400 px-2 py-0.5 text-amber-700 transition-colors hover:bg-amber-50"
          >
            对照
          </button>
        )}
      </div>
      <LabGoalMappingForm goalText={goalText} onGoalTextChange={setGoalText} />

      {goals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {goals.map((goal) => (
            <button
              key={goal.id}
              type="button"
              onClick={() => selectGoal(goal.id)}
              className={`rounded px-2 py-1 ${
                goal.id === selectedGoalId
                  ? "bg-amber-100 text-stone-700"
                  : "bg-stone-100 text-stone-500"
              }`}
            >
              {goal.title}
            </button>
          ))}
        </div>
      )}

      <LabGoalComposition />
      <LabGoalRoute />
      <LabGoalGapActions />
    </section>
  );
}
