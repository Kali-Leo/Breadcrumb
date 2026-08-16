/**
 * Purpose: the palace's right rail (re-cut by Leo, spec 048 §1) — hovering a place shows
 * its cluster card; otherwise the world level shows the heatmap/settled cards, continue
 * suggestions and (ranked mode) the goal card, and a dived island shows island-scoped
 * suggestions plus the self-report card. The wheel/click operation hints stay pinned at
 * the bottom in every state.
 * Main exports: MapInfoPanel.
 */
import type { MapLevel } from "./levels";
import { MirrorStack } from "./MirrorStack";
import type { HoverInfo } from "./mapHover";

interface MapInfoPanelProps {
  hover: HoverInfo | null;
  level: MapLevel;
}

const KIND_NAMES = { island: "岛屿", kingdom: "国度" } as const;

/** An islet is one node with nothing around it — it gets a plain line, not a place card. */
function HoverCards({ hover }: { hover: HoverInfo }) {
  if (hover.kind === "islet") {
    return (
      <div className="rounded-xl bg-white p-3 shadow-sm">
        <p className="text-sm text-stone-600">无名小岛 · {hover.label}</p>
        <p className="mt-1.5 text-xs leading-5 text-stone-400">你偶尔接触过、还没有深入学的内容</p>
      </div>
    );
  }
  return (
    <>
      <div className="rounded-xl bg-white p-3 shadow-sm">
        <p className="text-xs text-stone-400">{KIND_NAMES[hover.kind]}</p>
        <p className="mt-0.5 text-base font-semibold text-stone-700">{hover.label}</p>
        <p className="mt-1 text-sm text-stone-500">{hover.memberCount} 个知识点</p>
      </div>
      <div className="rounded-xl bg-white p-3 shadow-sm">
        <p className="mb-1.5 text-xs font-medium text-stone-600">这里住着</p>
        <div className="flex flex-wrap gap-1.5">
          {hover.pointLabels.slice(0, 12).map((label) => (
            <span
              key={label}
              className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
            >
              {label}
            </span>
          ))}
          {hover.pointLabels.length > 12 && (
            <span className="px-1 text-xs text-stone-400">
              …还有 {hover.pointLabels.length - 12} 个
            </span>
          )}
        </div>
      </div>
      {/* Only an island can be entered — the island view is the deepest one. */}
      {hover.kind === "island" && <p className="text-xs text-stone-400">滚轮向上，深入这里 →</p>}
    </>
  );
}

export function MapInfoPanel({ hover, level }: MapInfoPanelProps) {
  return (
    <aside className="flex h-full w-full flex-col border-l border-stone-200 bg-stone-50">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {hover !== null ? (
          <HoverCards hover={hover} />
        ) : level.kind === "world" ? (
          <MirrorStack />
        ) : null}
      </div>
      {/* Pinned in every state (Leo: the hints must not disappear when hovering). */}
      <div className="shrink-0 border-t border-stone-200 p-3 text-xs leading-5 text-stone-500">
        <p>滚轮向上：深入指针所指的地方</p>
        <p>滚轮向下：返回上一层</p>
        <p>点击地名：直接前往</p>
      </div>
    </aside>
  );
}
