/**
 * Purpose: the map's right rail — pointing at a continent or kingdom shows that region's
 * mirror readout (activity heatmap + trend lines scoped to its member nodes, debounced
 * 150ms under a mouse so skimming across regions does not thrash); an islet keeps its plain
 * line, and with nothing pointed at the world level shows the global mirror stack. "Pointed
 * at" is the mouse's hover or a finger's tap selection — the same channel, so the rail
 * reads one state and never asks which hand drove it. Under a finger the swap is immediate
 * (a tap is already a settled intent) and the island card's "go in" line becomes a real
 * button, the tap's second step for anyone who reads the card first.
 * Main exports: MapInfoPanel.
 */
import type { WorldModel } from "@breadcrumb/feature-map";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  loadRegionFeedbackSources,
  type RegionFeedbackSources,
} from "../../lib/feedback/regionFeedbackData";
import { useInputMode } from "../../lib/platform/inputMode";
import { useSettingsStore } from "../../stores/settingsStore";
import { ForwardArrow } from "../DirectionalArrow";
import { CurrentIslandCard } from "./CurrentIslandCard";
import { findIsland, type MapLevel } from "./levels";
import { IsletCard, PlaceCards } from "./MapPlaceCards";
import { MirrorStack } from "./MirrorStack";
import type { HoverInfo } from "./mapHover";
import { RegionMirror } from "./RegionMirror";

interface MapInfoPanelProps {
  /** What the map points at: hover under a mouse, the tap selection under a finger. */
  hover: HoverInfo | null;
  level: MapLevel;
  world: WorldModel;
  /** Non-null while goal mode is cutting the map: the goal's title and full node set. The
   * rail then keeps ONE scope — goal overall when idle, goal region on hover — so the
   * blank-state numbers can never contradict the hover numbers (2026-08-16 bug: global
   * charts while idle + empty goal regions on hover read as broken). */
  goalScope: { title: string; nodeIds: ReadonlySet<string> } | null;
  /** The card's own way in (an island dives, a kingdom opens its subway map). */
  onEnter(info: HoverInfo): void;
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

export function MapInfoPanel({ hover, level, world, goalScope, onEnter }: MapInfoPanelProps) {
  const { t } = useTranslation("palace");
  const coarse = useInputMode() === "coarse";
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
    const timer = setTimeout(() => setSettledHover(hover), coarse ? 0 : HOVER_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [hover, coarse]);

  const region =
    settledHover !== null && feedbackLabEnabled ? regionNodeIds(world, level, settledHover) : null;
  // Inside an island with nothing under the pointer, the island itself is what the map
  // points at — its card (and the rename action) sits where the rail was blank before.
  const currentIsland = level.kind === "island" ? findIsland(world, level.islandId) : undefined;
  // Only an island can be entered from the world (the island view is the deepest one); a
  // kingdom's way in is its subway map, offered as a button where a second tap would do it.
  const enterable =
    settledHover !== null &&
    (settledHover.kind === "island" || (coarse && settledHover.kind === "kingdom"));

  return (
    <aside className="flex h-full w-full flex-col border-s border-stone-200 bg-stone-50 stacked:h-auto stacked:border-s-0 stacked:border-t">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 stacked:overflow-visible">
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
                  emptyLine={goalScope !== null ? t("map.goalAreaNotStarted") : undefined}
                />
              ) : (
                <PlaceCards hover={settledHover} />
              )}
              {enterable && coarse && (
                <button
                  type="button"
                  onClick={() => onEnter(settledHover)}
                  className="flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-amber-500 text-sm text-white"
                >
                  {t("map.enterButton")} <ForwardArrow />
                </button>
              )}
              {enterable && !coarse && (
                <p className="text-xs text-stone-400">
                  {t("map.zoomInPrompt")} <ForwardArrow />
                </p>
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
            emptyLine={t("map.goalNotStarted")}
          />
        ) : level.kind === "world" ? (
          <MirrorStack />
        ) : currentIsland !== undefined ? (
          <CurrentIslandCard island={currentIsland} />
        ) : null}
      </div>
    </aside>
  );
}
