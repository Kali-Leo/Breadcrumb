/**
 * Purpose: the panel beside the square map — world overview and gentle hints when
 * idle, a knowledge-cluster introduction when hovering a place, one plain line when
 * hovering an unnamed islet (a single touch, nothing to enter). AI-written
 * introductions arrive with the naming feature (switch + metering); until then the
 * panel summarizes from local data only.
 * Main exports: MapInfoPanel.
 */
import type { WorldModel } from "@breadcrumb/plugin-map";
import type { HoverInfo } from "./mapController";

interface MapInfoPanelProps {
  world: WorldModel;
  hover: HoverInfo | null;
  levelPath: string[];
}

const KIND_NAMES = { island: "岛屿", kingdom: "国度", village: "村庄" } as const;

/** An islet is one node with nothing around it — it gets a plain line, not a place card. */
function HoverCards({ hover }: { hover: HoverInfo }) {
  if (hover.kind === "islet") {
    return (
      <div className="rounded-xl bg-white p-3 shadow-sm">
        <p className="text-sm text-stone-600">无名小岛 · {hover.label}</p>
        <p className="mt-1.5 text-xs leading-5 text-stone-400">偶尔碰过、还没成气候的关注</p>
      </div>
    );
  }
  return (
    <>
      <div className="rounded-xl bg-white p-3 shadow-sm">
        <p className="text-xs text-stone-400">{KIND_NAMES[hover.kind]}</p>
        <p className="mt-0.5 text-base font-semibold text-stone-700">{hover.label}</p>
        <p className="mt-1 text-sm text-stone-500">
          {hover.memberCount} 个知识点
          {hover.kind !== "village" && ` · ${hover.childCount} 个下辖`}
        </p>
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
      <div className="rounded-xl border border-dashed border-stone-200 p-3 text-xs leading-5 text-stone-400">
        AI 简介待接入——开启后，这里会根据这片知识写一段简介。
      </div>
      <p className="text-xs text-stone-400">滚轮向上，深入这里 →</p>
    </>
  );
}

export function MapInfoPanel({ world, hover, levelPath }: MapInfoPanelProps) {
  const islandCount = world.islands.length;
  const kingdomCount = world.islands.reduce((sum, island) => sum + island.kingdoms.length, 0);
  const pointCount = world.islands.reduce((sum, island) => sum + island.memberNodeIds.length, 0);

  return (
    <aside className="flex h-full w-full flex-col gap-4 overflow-y-auto border-l border-stone-200 bg-stone-50 p-4">
      <div>
        <h2 className="text-lg font-semibold text-stone-700">记忆宫殿</h2>
        <p className="mt-1 text-xs text-stone-400">{levelPath.join(" · ")}</p>
      </div>

      {hover === null ? (
        <>
          <div className="rounded-xl bg-white p-3 text-sm text-stone-600 shadow-sm">
            <p>
              {islandCount} 座岛屿 · {kingdomCount} 个国度
            </p>
            <p className="mt-1">{pointCount} 个知识点已定居</p>
          </div>
          <div className="rounded-xl bg-white p-3 text-xs leading-5 text-stone-500 shadow-sm">
            <p className="mb-1 font-medium text-stone-600">操作</p>
            <p>滚轮向上：深入指针所指的地方</p>
            <p>滚轮向下：返回上一层</p>
            <p>点击地名：直接前往</p>
          </div>
        </>
      ) : (
        <HoverCards hover={hover} />
      )}
    </aside>
  );
}
