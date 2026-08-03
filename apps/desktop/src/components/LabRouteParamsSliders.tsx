/**
 * Purpose: the two human-legible sliders behind recommendRoute() (spec 017 #1) — pace
 * (steady <-> fast) and interestWeight (plan <-> interest). Dragging writes through to
 * settingsStore (persisted) and immediately recomputes the route locally, no network call.
 * Main exports: LabRouteParamsSliders.
 */
import { usePlannerStore } from "../stores/plannerStore";
import { useSettingsStore } from "../stores/settingsStore";

function RouteSlider({
  label,
  caption,
  value,
  onChange,
}: {
  label: string;
  caption: string;
  value: number;
  onChange(value: number): void;
}) {
  return (
    <label className="block space-y-0.5">
      <span className="flex items-center justify-between text-stone-600">
        <span className="font-medium">{label}</span>
        <span className="text-stone-400">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-amber-500"
      />
      <span className="block text-stone-400">{caption}</span>
    </label>
  );
}

export function LabRouteParamsSliders() {
  const routeParams = useSettingsStore((state) => state.routeParams);
  const setRouteParams = useSettingsStore((state) => state.setRouteParams);
  const recomputeRoute = usePlannerStore((state) => state.recomputeRoute);

  async function updatePace(pace: number) {
    await setRouteParams({ ...routeParams, pace });
    recomputeRoute();
  }

  async function updateInterestWeight(interestWeight: number) {
    await setRouteParams({ ...routeParams, interestWeight });
    recomputeRoute();
  }

  return (
    <div className="grid grid-cols-2 gap-3 rounded border border-stone-200 p-2">
      <RouteSlider
        label="节奏"
        caption="偏稳：每步都有旧知识帮衬；偏快：最短路径冲目标"
        value={routeParams.pace}
        onChange={(value) => void updatePace(value)}
      />
      <RouteSlider
        label="兴趣跟随"
        caption="越高越优先学你感兴趣的分支"
        value={routeParams.interestWeight}
        onChange={(value) => void updateInterestWeight(value)}
      />
    </div>
  );
}
