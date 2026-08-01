/**
 * Purpose: lab-panel goal section — free-text goal to LLM mapping, checkbox calibration of
 * existing/suggested nodes, save, then a goal picker with side-by-side shortest/steadiest/
 * interest-first routes and a coverage fraction. Copy is suggest-only ("可以学"), never
 * "behind" or "missing" (product principle 1).
 * Main exports: LabGoalSection.
 */
import { useState } from "react";
import { usePlannerStore } from "../stores/plannerStore";
import { LabGoalMappingForm } from "./LabGoalMappingForm";
import { LabGoalRoutes } from "./LabGoalRoutes";

export function LabGoalSection() {
  const goals = usePlannerStore((state) => state.goals);
  const selectedGoalId = usePlannerStore((state) => state.selectedGoalId);
  const selectGoal = usePlannerStore((state) => state.selectGoal);

  const [goalText, setGoalText] = useState("");

  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-stone-600">学习目标</h3>
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

      <LabGoalRoutes />
    </section>
  );
}
