/**
 * Purpose: the map's right rail — hovering a continent or kingdom shows that region's
 * mirror readout (activity heatmap + trend lines scoped to its member nodes, debounced
 * 150ms so skimming across regions does not thrash); an islet keeps its plain line, and
 * with nothing hovered the world level shows the global mirror stack. The wheel/click
 * operation hints moved onto the map canvas itself (MapView).
 * Main exports: MapInfoPanel.
 */
import type { WorldModel } from "@breadcrumb/plugin-map";
import { useEffect, useState } from "react";
import {
  loadRegionFeedbackSources,
  type RegionFeedbackSources,
} from "../../lib/regionFeedbackData";
import { useSettingsStore } from "../../stores/settingsStore";
import { findIsland, type MapLevel } from "./levels";
import { MirrorStack } from "./MirrorStack";
import type { HoverInfo } from "./mapHover";
import { RegionMirror } from "./RegionMirror";

interface MapInfoPanelProps {
  hover: HoverInfo | null;
  level: MapLevel;
  world: WorldModel;
  /** Non-null while goal mode is cutting the map: the goal's title and full node set. The
   * rail then keeps ONE scope — goal overall when idle, goal region on hover — so the
   * blank-state numbers can never contradict the hover numbers (2026-08-16 bug: global
   * charts while idle + empty goal regions on hover read as broken). */
  goalScope: { title: string; nodeIds: ReadonlySet<string> } | null;
}

/** Skimming across regions settles before the rail swaps content (owner's ruling: 150ms). */
const HOVER_SETTLE_MS = 150;

/** The hovered region's member node ids, resolved from the world model: an island clusters
 * its whole subtree, a kingdom (only reachable at the island level) its own subtree. */
function regionNodeIds(
  world: WorldModel,
  level: MapLevel,
  hover: HoverInfo,
): ReadonlySet<string> | null {
  if (hover.kind === "island") {
    const island = findIsland(world, hover.nodeId);
    return island === undefined ? null : new Set(island.memberNodeIds);
  }
  if (hover.kind === "kingdom" && level.kind === "island") {
    const island = findIsland(world, level.islandId);
    const kingdom = island?.kingdoms.find((candidate) => candidate.nodeId === hover.nodeId);
    return kingdom === undefined ? null : new Set(kingdom.memberNodeIds);
  }
  return null;
}

/** An islet is one node with nothing around it — a plain line, not a region readout. */
function IsletCard({ hover }: { hover: HoverInfo }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <p className="text-sm text-stone-600">无名小岛 · {hover.label}</p>
      <p className="mt-1.5 text-xs leading-5 text-stone-400">你偶尔接触过、还没有深入学的内容</p>
    </div>
  );
}

const KIND_NAMES = { island: "岛屿", islet: "岛屿", kingdom: "国度" } as const;

/** Fallback place card when the mirror modules are switched off — name and residents only. */
function PlaceCards({ hover }: { hover: HoverInfo }) {
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
    </>
  );
}

export function MapInfoPanel({ hover, level, world, goalScope }: MapInfoPanelProps) {
  const feedbackLabEnabled = useSettingsStore((state) => state.featureSwitches.feedbackLab);
  const [sources, setSources] = useState<RegionFeedbackSources | null>(null);
  const [settledHover, setSettledHover] = useState<HoverInfo | null>(null);

  // One raw-rows fetch per map visit; every hover afterwards filters in memory.
  useEffect(() => {
    if (!feedbackLabEnabled) return undefined;
    let cancelled = false;
    void loadRegionFeedbackSources().then((data) => {
      if (!cancelled) setSources(data);
    });
    return () => {
      cancelled = true;
    };
  }, [feedbackLabEnabled]);

  useEffect(() => {
    const timer = setTimeout(() => setSettledHover(hover), HOVER_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [hover]);

  const region =
    settledHover !== null && feedbackLabEnabled ? regionNodeIds(world, level, settledHover) : null;

  return (
    <aside className="flex h-full w-full flex-col border-l border-stone-200 bg-stone-50">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {settledHover !== null ? (
          settledHover.kind === "islet" ? (
            <IsletCard hover={settledHover} />
          ) : (
            <>
              {region !== null ? (
                <RegionMirror
                  key={settledHover.nodeId}
                  title={settledHover.label}
                  memberCount={settledHover.memberCount}
                  nodeIds={region}
                  sources={sources}
                  emptyLine={goalScope !== null ? "目标里的这片还没开始学" : undefined}
                />
              ) : (
                <PlaceCards hover={settledHover} />
              )}
              {/* Only an island can be entered — the island view is the deepest one. */}
              {settledHover.kind === "island" && (
                <p className="text-xs text-stone-400">滚轮向上，深入这里 →</p>
              )}
            </>
          )
        ) : goalScope !== null && feedbackLabEnabled ? (
          <RegionMirror
            key="goal-scope"
            title={goalScope.title}
            memberCount={goalScope.nodeIds.size}
            nodeIds={goalScope.nodeIds}
            sources={sources}
            emptyLine="这个目标还没开始；开始学习后，记录会出现在这里"
          />
        ) : level.kind === "world" ? (
          <MirrorStack />
        ) : null}
      </div>
    </aside>
  );
}
