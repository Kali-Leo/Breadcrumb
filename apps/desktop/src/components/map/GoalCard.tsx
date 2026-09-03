/**
 * Purpose: the map rail's goal card (spec 047) — lists the goals and offers one entry,
 * 目标设置, into the goal view (which handles both adding and viewing). No progress
 * fractions, no denominators (ladder rule: assessment is never displayed as a mechanism).
 * Main exports: GoalCard.
 */

import { useTranslation } from "react-i18next";
import { usePlannerStore } from "../../stores/plannerStore";

interface GoalCardProps {
  onOpenGoalView(): void;
}

export function GoalCard({ onOpenGoalView }: GoalCardProps) {
  const { t } = useTranslation(["palace", "common"]);
  const goals = usePlannerStore((state) => state.goals);

  return (
    <section className="rounded-xl bg-white p-3 text-xs shadow-sm">
      <h3 className="font-semibold text-stone-600">{t("palace:goalCard.title")}</h3>
      {goals.length === 0 ? (
        <p className="mt-1 text-stone-400">{t("palace:goalCard.empty")}</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-1">
          {goals.map((goal) => (
            <li key={goal.id} className="rounded bg-stone-100 px-2 py-0.5 text-stone-600">
              {goal.title}
            </li>
          ))}
        </ul>
      )}
      {/* One entry only — the goal view itself handles both adding and viewing. */}
      <div className="mt-2">
        <button
          type="button"
          onClick={onOpenGoalView}
          className="rounded bg-amber-500 px-2 py-0.5 text-white transition-colors hover:bg-amber-600 coarse:min-h-11 coarse:px-3"
        >
          {t("palace:goalCard.settings")}
        </button>
      </div>
    </section>
  );
}
