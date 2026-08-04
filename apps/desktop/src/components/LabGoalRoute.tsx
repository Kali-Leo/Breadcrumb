/**
 * Purpose: lab-panel route display — the selected goal's single recommended route (spec 017
 * #1), each step tagged with plain reason chips, the coverage fraction, and the two tuning
 * sliders. The legacy three-route comparison (最短/最稳/兴趣优先) is deleted from the UI
 * entirely per Leo's 2026-08-04 amendment — those words must not appear anywhere user-visible
 * again. gapAndPath() still computes all three internally (gap/coverage still need it) and
 * keeps its own tests in plugin-planner; only the desktop rendering of them is gone.
 * Main exports: LabGoalRoute.
 */

import type { RecommendedRouteStep } from "@breadcrumb/plugin-planner";
import { ROUTE_INTEREST_CHIP_THRESHOLD } from "@breadcrumb/plugin-planner";
import { usePlannerStore } from "../stores/plannerStore";
import { LabRouteParamsSliders } from "./LabRouteParamsSliders";

const chipClass = "rounded bg-amber-100 px-1 text-amber-700";

function StepReasonChips({ reason }: { reason: RecommendedRouteStep["reason"] }) {
  return (
    <span className="flex flex-wrap gap-1 text-stone-500">
      {reason.helpsSources.length > 0 && (
        <span className={chipClass}>帮衬来源 {reason.helpsSources.length} 个</span>
      )}
      {reason.interest > ROUTE_INTEREST_CHIP_THRESHOLD && <span className={chipClass}>兴趣</span>}
      {reason.unlocks && <span className={chipClass}>通往「{reason.unlocks.label}」</span>}
      {reason.isGoalNode && <span className={chipClass}>目标内</span>}
    </span>
  );
}

export function LabGoalRoute() {
  const gap = usePlannerStore((state) => state.gap);
  const route = usePlannerStore((state) => state.route);
  const coverageFraction = usePlannerStore((state) => state.coverageFraction);

  if (gap === null || route === null) {
    return <p className="text-stone-400">选一个目标，或先新建一个，看看路线长什么样。</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-stone-500">覆盖率 {((coverageFraction ?? 0) * 100).toFixed(0)}%</p>
      <LabRouteParamsSliders />
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
    </div>
  );
}
