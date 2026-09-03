/**
 * Purpose: the goal view (spec 047) — the palace's drill-in for "我想去哪里？离得还有多
 * 远？": goal creation via free-text mapping, a goal picker, the decomposition chips, the
 * recommended route, per-node self-statement actions, and the comparison tree as the
 * goal's detail module. No progress percentages, no denominators, no mode switch: goals
 * are objects — this view is simply empty-handed until one exists.
 * Main exports: GoalView.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePlannerStore } from "../../stores/plannerStore";
import { BackArrow } from "../DirectionalArrow";
import { CompareSection } from "./CompareSection";
import { GoalComposition } from "./GoalComposition";
import { GoalGapActions } from "./GoalGapActions";
import { GoalMappingForm } from "./GoalMappingForm";
import { GoalRoute } from "./GoalRoute";

interface GoalViewProps {
  onClose(): void;
}

export function GoalView({ onClose }: GoalViewProps) {
  const { t } = useTranslation("palace");
  const goals = usePlannerStore((state) => state.goals);
  const selectedGoalId = usePlannerStore((state) => state.selectedGoalId);
  const selectGoal = usePlannerStore((state) => state.selectGoal);
  const [goalText, setGoalText] = useState("");

  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-700">{t("goal.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-stone-500 hover:bg-stone-100 coarse:inline-flex coarse:min-h-11 coarse:items-center"
          >
            <BackArrow /> {t("goal.backToMap")}
          </button>
        </div>

        {selectedGoalId === null && <p className="text-sm text-stone-500">{t("goal.intro")}</p>}
        <GoalMappingForm goalText={goalText} onGoalTextChange={setGoalText} />

        {goals.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {goals.map((goal) => (
              <button
                key={goal.id}
                type="button"
                onClick={() => selectGoal(goal.id)}
                className={`rounded px-2 py-1 coarse:inline-flex coarse:min-h-11 coarse:items-center ${
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

        <GoalComposition />
        <GoalRoute />
        <GoalGapActions />
        <CompareSection />
      </div>
    </div>
  );
}
