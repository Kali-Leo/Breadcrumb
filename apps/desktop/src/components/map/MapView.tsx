/**
 * Purpose: the memory palace page — one persistent Pixi renderer, discrete level
 * jumps (world → island, the deepest view) with exact-fit framing, no free zoom or panning.
 * The world model (continents, caching, the goal cut) is assembled in useWorldModel and
 * pushed to the controller by useMapSceneSync. The Pixi lifecycle lives in
 * useMapApplication; if its init fails the page says so in place instead of staying blank.
 * StrictMode-safe; DEV keys 0 demo, 1..2 jumps.
 *
 * Two shapes, one page. Wide (≥1024px landscape): the square map hugs the left, the context
 * rail stands beside it. Stacked (narrow or portrait): the left rail's cards run across the
 * top, the map is a square as wide as the screen (capped at 70% of its height), the rail
 * follows underneath and the whole page scrolls — content always wins over geometry.
 * Main exports: MapView.
 */

import { useEffect, useState } from "react";
import { isPlaceRenamable } from "../../lib/map/placeNames";
import { degradeSilently } from "../../lib/platform/failureLog";
import { useInputMode } from "../../lib/platform/inputMode";
import { useLayoutMode } from "../../lib/platform/layoutMode";
import { appEventBus } from "../../stores/chatStore";
import { useFeedbackStore } from "../../stores/feedbackStore";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import { useMemoryStore } from "../../stores/memoryStore";
import { usePlannerStore } from "../../stores/plannerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { GoalView } from "../goal/GoalView";
import { demoSessionTrail } from "./demoWorld";
import { type KingdomRef, KingdomView } from "./kingdom/KingdomView";
import { findIsland, type MapLevel } from "./levels";
import { MapCanvasChrome } from "./MapCanvasChrome";
import { MapInfoPanel } from "./MapInfoPanel";
import { MapStateOverlay, mapOverlayState } from "./MapStateOverlay";
import type { HoverInfo } from "./mapHover";
import { PalaceRail } from "./PalaceRail";
import { useMapApplication } from "./useMapApplication";
import { useMapPinch } from "./useMapPinch";
import { useMapSceneSync } from "./useMapSceneSync";
import { useWorldModel } from "./useWorldModel";

/** The square map box. Wide: as tall as the page, never wider than what leaves the rail its
 * 16rem (floored at 0 — a negative max-width used to erase the canvas on a phone, B1).
 * Stacked: as wide as the page, capped so some rail stays in view under it. */
const MAP_BOX =
  "relative h-full wide:max-w-[max(0px,calc(100%_-_16rem))] stacked:h-auto stacked:w-[min(100%,70dvh)] stacked:shrink-0";
const RAIL_BOX =
  "h-full min-w-64 flex-1 overflow-y-auto stacked:h-auto stacked:min-w-0 stacked:flex-none stacked:overflow-visible";

export function MapView() {
  const coarse = useInputMode() === "coarse";
  const stacked = useLayoutMode() === "stacked";

  const storeSessionNodeIds = useKnowledgeStore((state) => state.sessionNodeIds);
  const [demoMode, setDemoMode] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [level, setLevel] = useState<MapLevel>({ kind: "world" });
  const [goalViewOpen, setGoalViewOpen] = useState(false);
  const [subwayKingdom, setSubwayKingdom] = useState<(KingdomRef & { islandId: string }) | null>(
    null,
  );

  // Fog data should be fresh whenever the palace opens.
  useEffect(() => {
    void useMemoryStore.getState().refresh();
  }, []);

  // Mirror modules (spec 046): one load per palace visit feeds the whole context stack.
  const feedbackLabEnabled = useSettingsStore((state) => state.featureSwitches.feedbackLab);
  useEffect(() => {
    if (feedbackLabEnabled) void useFeedbackStore.getState().loadAll();
  }, [feedbackLabEnabled]);

  // The left rail's goal card opens the palace-internal goal view via the bus (spec 050 §5).
  useEffect(() => {
    return appEventBus.on("palace:openGoalView", () => setGoalViewOpen(true));
  }, []);

  // Planner cold start (spec 047): the palace hosts the frontier/goal surfaces now, so the
  // one-time recompute that used to live in the lab happens here; event subscriptions keep
  // it fresh afterwards.
  useEffect(() => {
    usePlannerStore
      .getState()
      .recompute()
      .catch((error: unknown) => degradeSilently("planner", error));
  }, []);

  const { world, displayWorld, goalScope, retentionByNode } = useWorldModel(demoMode);
  const { containerRef, controllerRef, trailIdsRef, ready, initFailed } = useMapApplication({
    onHover: setHover,
    onLevel: setLevel,
    // Entering a kingdom (click, second tap, pinch, or the rail's button) opens its subway
    // map. The hit is resolved by the controller at event time — never from React's `hover`,
    // which on a tap was still the previous render's null (touch-audit 1.6).
    onEnterKingdom(nodeId) {
      if (level.kind !== "island") return;
      const kingdom = findIsland(displayWorld, level.islandId)?.kingdoms.find(
        (candidate) => candidate.nodeId === nodeId,
      );
      if (kingdom === undefined) return;
      const { label, memberNodeIds } = kingdom;
      setSubwayKingdom({ nodeId, label, memberNodeIds, islandId: level.islandId });
    },
  });
  trailIdsRef.current = demoMode ? demoSessionTrail : storeSessionNodeIds;
  useMapSceneSync({
    ready,
    controllerRef,
    world,
    displayWorld,
    retentionByNode,
    demoMode,
    setDemoMode,
  });
  useMapPinch({ ready, coarse, containerRef, controllerRef });

  // Neither of these may return early: the Pixi container has to stay mounted or the renderer
  // never initializes, and useMapApplication's effect runs once (bug hunt 2026-09-03 — an
  // empty sea on the first visit left the map dead for the whole session). They cover instead.
  const overlay = mapOverlayState({ initFailed, islandCount: world.islands.length });

  // The overlay's header reads the kingdom's name from the live world, not the click-time
  // snapshot, so a rename made inside the overlay shows there at once.
  const subwayIsland =
    subwayKingdom === null ? undefined : findIsland(displayWorld, subwayKingdom.islandId);
  const subwayLabel =
    subwayIsland?.kingdoms.find((candidate) => candidate.nodeId === subwayKingdom?.nodeId)?.label ??
    subwayKingdom?.label;

  // The goal view and a kingdom's subway map cover the palace as overlays instead of
  // replacing it — the Pixi application initializes once per mount and its canvas would not
  // survive an unmount/remount of its container (spec 048 walkthrough finding).
  return (
    <div className="relative h-full w-full">
      <div className="flex h-full w-full overflow-hidden stacked:flex-col stacked:overflow-y-auto">
        {stacked && <PalaceRail layout="row" />}
        <div className={MAP_BOX} style={{ aspectRatio: "1 / 1" }}>
          <div
            ref={containerRef}
            data-tour="map-canvas"
            className="h-full w-full overflow-hidden"
          />
          <MapCanvasChrome
            level={level}
            coarse={coarse}
            onBack={() => controllerRef.current?.navigation.back()}
          />
        </div>
        <div className={RAIL_BOX}>
          <MapInfoPanel
            hover={hover}
            level={level}
            world={displayWorld}
            goalScope={goalScope}
            onEnter={(info) => controllerRef.current?.navigation.enter(info)}
          />
        </div>
      </div>
      {overlay !== null && <MapStateOverlay state={overlay} />}
      {goalViewOpen && (
        <div className="absolute inset-0 z-20 bg-stone-50">
          <GoalView onClose={() => setGoalViewOpen(false)} />
        </div>
      )}
      {subwayKingdom !== null && (
        <div className="absolute inset-0 z-20 bg-stone-50">
          <KingdomView
            kingdom={{ ...subwayKingdom, label: subwayLabel ?? subwayKingdom.label }}
            renamable={
              subwayIsland !== undefined && isPlaceRenamable(subwayIsland, subwayKingdom.nodeId)
            }
            onClose={() => setSubwayKingdom(null)}
          />
        </div>
      )}
    </div>
  );
}
