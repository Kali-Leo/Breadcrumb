/**
 * Purpose: the selected goal's single recommended route (spec 017 #1; re-homed by spec 047)
 * — each step tagged with plain reason chips. The tuning sliders and the coverage
 * percentage were retired with the lab (mechanism stays internal; pace/interestWeight run
 * on their neutral defaults). The legacy three-route comparison stays deleted from UI per
 * Leo's 2026-08-04 amendment.
 * Main exports: GoalRoute.
 */

import type { RecommendedRouteStep } from "@breadcrumb/plugin-planner";
import { ROUTE_INTEREST_CHIP_THRESHOLD } from "@breadcrumb/plugin-planner";
import { useTranslation } from "react-i18next";
import { usePlannerStore } from "../../stores/plannerStore";

const chipClass = "rounded bg-amber-100 px-1 text-amber-700";

function StepReasonChips({ reason }: { reason: RecommendedRouteStep["reason"] }) {
  const { t } = useTranslation("palace");
  return (
    <span className="flex flex-wrap gap-1 text-stone-500">
      {reason.helpsSources.length > 0 && <span className={chipClass}>{t("goal.chipBasis")}</span>}
      {reason.interest > ROUTE_INTEREST_CHIP_THRESHOLD && (
        <span className={chipClass}>{t("goal.chipInterest")}</span>
      )}
      {reason.unlocks && (
        <span className={chipClass}>{t("goal.chipUnlocks", { label: reason.unlocks.label })}</span>
      )}
      {reason.isGoalNode && <span className={chipClass}>{t("goal.chipInGoal")}</span>}
    </span>
  );
}

export function GoalRoute() {
  const { t } = useTranslation("palace");
  const gap = usePlannerStore((state) => state.gap);
  const route = usePlannerStore((state) => state.route);

  if (gap === null || route === null) {
    return <p className="text-stone-400">{t("goal.pickGoal")}</p>;
  }

  return (
    <ol className="space-y-1">
      {route.map((step, index) => (
        <li key={step.nodeId} className="rounded border border-stone-200 px-2 py-1">
          <div className="flex items-center gap-2">
            <span className="text-stone-400">{index + 1}</span>
            <span className="font-medium">{step.label}</span>
          </div>
          <StepReasonChips reason={step.reason} />
        </li>
      ))}
    </ol>
  );
}
