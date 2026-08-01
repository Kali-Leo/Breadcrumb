/**
 * Purpose: lab-panel route comparison — the selected goal's coverage fraction plus its three
 * routes (shortest / steadiest / interest-first) rendered side by side, none singled out as
 * "correct" (product principle 1: three options, learner decides).
 * Main exports: LabGoalRoutes.
 */
import { usePlannerStore } from "../stores/plannerStore";

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
  const coverageFraction = usePlannerStore((state) => state.coverageFraction);

  if (gap === null) {
    return <p className="text-stone-400">选一个目标，或先新建一个，看看三条路线长什么样。</p>;
  }

  const labelById = new Map(nodes.map((node) => [node.id, node.label]));

  return (
    <div className="space-y-2">
      <p className="text-stone-500">
        覆盖率 {((coverageFraction ?? 0) * 100).toFixed(0)}%——三条路线仅供参考，走哪条都可以
      </p>
      <div className="flex gap-2">
        <RouteColumn title="最短" nodeIds={gap.routes.shortest} labelById={labelById} />
        <RouteColumn title="最稳" nodeIds={gap.routes.steadiest} labelById={labelById} />
        <RouteColumn title="兴趣优先" nodeIds={gap.routes.interestFirst} labelById={labelById} />
      </div>
    </div>
  );
}
