/**
 * Purpose: the memory palace page — one persistent Pixi renderer, discrete level
 * jumps (world → island, the deepest view) on the wheel with exact-fit framing, no free
 * zoom or panning. The world model (continents, caching, the goal cut) is assembled in
 * useWorldModel and pushed to the controller by useMapSceneSync. The Pixi lifecycle lives in
 * useMapApplication; if its init fails the page says so in place instead of staying blank.
 * StrictMode-safe; DEV keys 0 demo, 1..2 jumps.
 * Main exports: MapView.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isPlaceRenamable } from "../../lib/map/placeNames";
import { degradeSilently } from "../../lib/platform/failureLog";
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
import { MapInfoPanel } from "./MapInfoPanel";
import { MapModeToggle } from "./MapModeToggle";
import type { HoverInfo } from "./mapHover";
import { useMapApplication } from "./useMapApplication";
import { useMapSceneSync } from "./useMapSceneSync";
import { useWorldModel } from "./useWorldModel";

export function MapView() {
  const { t } = useTranslation(["palace", "common"]);

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

  // The goal view is the palace's drill-in (spec 047) — it replaces the whole page and
  // returns to the exact map state on close (level/camera state lives in the controller
  // and is not reset by this swap... the Pixi app unmounts; cachedWorldModel keeps the
  // rebuild cheap and the world level is the natural landing).
  if (initFailed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-stone-50 text-stone-400">
        <span className="text-4xl">🏛️</span>
        <p className="text-sm">{t("palace:map.loadFailed")}</p>
      </div>
    );
  }
  if (world.islands.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-stone-50 text-stone-400">
        <span className="text-4xl">🏛️</span>
        <p className="text-sm">{t("palace:map.emptySea")}</p>
        {import.meta.env.DEV && (
          <p className="text-xs text-stone-300">{t("palace:map.devDemoHint")}</p>
        )}
      </div>
    );
  }
  // Clicking a kingdom while dived into its island opens the kingdom's subway map — the
  // Pixi controller only navigates world→island itself, so this stays a plain DOM handler.
  function onCanvasClick() {
    if (level.kind !== "island" || hover === null || hover.kind !== "kingdom") return;
    const island = findIsland(displayWorld, level.islandId);
    const kingdom = island?.kingdoms.find((candidate) => candidate.nodeId === hover.nodeId);
    if (kingdom === undefined) return;
    setSubwayKingdom({
      nodeId: kingdom.nodeId,
      label: kingdom.label,
      memberNodeIds: kingdom.memberNodeIds,
      islandId: level.islandId,
    });
  }
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
      <div className="flex h-full w-full overflow-hidden">
        {/* Square map hugging the left when space allows; when the window is small the
            rail keeps its minimum width and the map gives way (the camera fit letterboxes
            a non-square canvas) — content always wins over geometry. */}
        <div
          className="relative h-full"
          style={{ aspectRatio: "1 / 1", maxWidth: "calc(100% - 16rem)" }}
        >
          {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: the Pixi canvas owns pointer semantics; this handler only augments its hover state */}
          <div
            ref={containerRef}
            data-tour="map-canvas"
            className="h-full w-full overflow-hidden"
            onClick={onCanvasClick}
          />
          <div className="absolute start-3 top-3 z-10">
            <MapModeToggle />
          </div>
          {/* Operation hints live on the map itself (owner fix 5) — quiet ink in the
              bottom-left corner of the parchment, never a rail resident. */}
          <div className="pointer-events-none absolute bottom-3 start-3 z-10 rounded bg-stone-100/60 px-2 py-1 text-[11px] leading-4 text-stone-600/75">
            <p>{t("palace:map.zoomInHint")}</p>
            <p>{t("palace:map.zoomOutHint")}</p>
            <p>{t("palace:map.clickNameHint")}</p>
          </div>
        </div>
        <div className="h-full min-w-64 flex-1 overflow-y-auto">
          <MapInfoPanel hover={hover} level={level} world={displayWorld} goalScope={goalScope} />
        </div>
      </div>
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
