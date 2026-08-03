/**
 * Purpose: lab-panel route display — the selected goal's single recommended route (spec 017
 * #1), each step tagged with plain reason chips, plus the coverage fraction and the two
 * tuning sliders. The legacy three-route comparison (shortest/steadiest/interest-first) still
 * lives here, collapsed under "其他排序参考" — nothing gets deleted (product principle 1).
 * Main exports: LabGoalRoutes.
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

function RouteColumn({
  title,
  nodeIds,
  labelById,
}: {
  title: string;
  nodeIds: readonly string[];
  labelById: ReadonlyMap<string, string>;
}) {
  return (
    <div className="flex-1 rounded border border-stone-200 p-2">
      <p className="mb-1 font-medium text-stone-600">{title}</p>
      <ol className="list-decimal space-y-0.5 pl-4">
        {nodeIds.map((nodeId) => (
          <li key={nodeId}>{labelById.get(nodeId) ?? nodeId}</li>
        ))}
      </ol>
    </div>
  );
}

export function LabGoalRoutes() {
  const nodes = usePlannerStore((state) => state.nodes);
  const gap = usePlannerStore((state) => state.gap);
  const route = usePlannerStore((state) => state.route);
  const coverageFraction = usePlannerStore((state) => state.coverageFraction);

  if (gap === null || route === null) {
    return <p className="text-stone-400">选一个目标，或先新建一个，看看路线长什么样。</p>;
  }

  const labelById = new Map(nodes.map((node) => [node.id, node.label]));

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
      <details className="rounded border border-stone-200">
        <summary className="cursor-pointer px-2 py-1 text-stone-500">其他排序参考</summary>
        <div className="flex gap-2 border-t border-stone-100 p-2">
          <RouteColumn title="最短" nodeIds={gap.routes.shortest} labelById={labelById} />
          <RouteColumn title="最稳" nodeIds={gap.routes.steadiest} labelById={labelById} />
          <RouteColumn title="兴趣优先" nodeIds={gap.routes.interestFirst} labelById={labelById} />
        </div>
      </details>
    </div>
  );
}
