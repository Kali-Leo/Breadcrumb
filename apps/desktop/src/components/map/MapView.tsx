/**
 * Purpose: the memory palace page — one persistent Pixi renderer, discrete level
 * jumps (world → island, the deepest view) on the wheel with exact-fit framing, no free
 * zoom or panning. Islands are derived continents once the async assignment loads (tree
 * roots first, clustering only for the flat leftovers, spec 031); until then the tree-root
 * fallback renders, which is fine and intended, and AI continent names (when that switch is
 * on) patch in a moment later. The world model is cached per (nodes, assignment) pair so
 * re-opening the palace skips the expensive terrain build (identical output, just
 * remembered). The Pixi lifecycle lives in useMapApplication; if its init fails the page
 * says so in place instead of staying blank. StrictMode-safe; DEV keys 0 demo, 1..2 jumps.
 * Main exports: MapView.
 */

import type { ContinentAssignment } from "@breadcrumb/plugin-map";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadContinentAssignment } from "../../lib/mapContinentActions";
import { applyAiContinentNames } from "../../lib/mapNamingActions";
import { useFeedbackStore } from "../../stores/feedbackStore";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import { useMemoryStore } from "../../stores/memoryStore";
import { usePlannerStore } from "../../stores/plannerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { GoalView } from "../goal/GoalView";
import { demoKnowledgeNodes, demoRetentionByNode, demoSessionTrail } from "./demoWorld";
import { KingdomSubwayView, type SubwayKingdom } from "./KingdomSubwayView";
import { findIsland, type MapLevel } from "./levels";
import { MapInfoPanel } from "./MapInfoPanel";
import { MapModeToggle } from "./MapModeToggle";
import type { HoverInfo } from "./mapHover";
import { cachedWorldModel } from "./mapWorldCache";
import { useMapApplication } from "./useMapApplication";

export function MapView() {
  const previousIdsRef = useRef(new Map<string, ReadonlySet<string>>());

  const storeNodes = useKnowledgeStore((state) => state.nodes);
  const storeSessionNodeIds = useKnowledgeStore((state) => state.sessionNodeIds);
  const storeRetention = useMemoryStore((state) => state.retentionByNode);
  const [demoMode, setDemoMode] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [level, setLevel] = useState<MapLevel>({ kind: "world" });
  const [goalViewOpen, setGoalViewOpen] = useState(false);
  const [subwayKingdom, setSubwayKingdom] = useState<SubwayKingdom | null>(null);
  const [continentAssignment, setContinentAssignment] = useState<ContinentAssignment | null>(null);

  // Fog data should be fresh whenever the palace opens.
  useEffect(() => {
    void useMemoryStore.getState().refresh();
  }, []);

  // Mirror modules (spec 046): one load per palace visit feeds the whole context stack.
  const feedbackLabEnabled = useSettingsStore((state) => state.featureSwitches.feedbackLab);
  useEffect(() => {
    if (feedbackLabEnabled) void useFeedbackStore.getState().loadAll();
  }, [feedbackLabEnabled]);

  // Planner cold start (spec 047): the palace hosts the frontier/goal surfaces now, so the
  // one-time recompute that used to live in the lab happens here; event subscriptions keep
  // it fresh afterwards.
  useEffect(() => {
    usePlannerStore
      .getState()
      .recompute()
      .catch((error: unknown) => console.warn("planner recompute skipped:", error));
  }, []);

  // Continents load asynchronously and re-derive whenever the tree changes; until the first
  // load resolves, cachedWorldModel's null-assignment fallback renders. AI names (spec 031
  // §3) arrive later still and simply replace the assignment once they do — the medoid-named
  // map is already on screen by then.
  useEffect(() => {
    let cancelled = false;
    void loadContinentAssignment(storeNodes).then((assignment) => {
      if (cancelled) return;
      setContinentAssignment(assignment);
      const settings = useSettingsStore.getState();
      if (
        assignment === null ||
        !settings.featureSwitches.mapTopicNaming ||
        !settings.networkEnabled ||
        settings.apiConfig === null
      ) {
        return;
      }
      void applyAiContinentNames(assignment, settings.apiConfig).then((named) => {
        if (!cancelled && named !== assignment) setContinentAssignment(named);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [storeNodes]);

  const nodes = demoMode ? demoKnowledgeNodes : storeNodes;
  const retentionByNode = demoMode ? demoRetentionByNode : storeRetention;
  // Demo nodes never match a real-data assignment's member ids, so demo mode always uses
  // the tree-root fallback.
  const effectiveAssignment = demoMode ? null : continentAssignment;
  const world = useMemo(
    () => cachedWorldModel(nodes, effectiveAssignment),
    [nodes, effectiveAssignment],
  );
  const { containerRef, controllerRef, trailIdsRef, ready, initFailed } = useMapApplication({
    onHover: setHover,
    onLevel: setLevel,
  });
  trailIdsRef.current = demoMode ? demoSessionTrail : storeSessionNodeIds;

  // Scene rebuilds on data changes; the renderer and camera model stay alive.
  useEffect(() => {
    if (!ready) return;
    controllerRef.current?.setWorld(
      world,
      retentionByNode,
      (() => {
        const datasetKey = demoMode ? "demo" : "real";
        const currentIds: ReadonlySet<string> = new Set(
          world.islands.flatMap((island) => island.memberNodeIds),
        );
        const previousIds = previousIdsRef.current.get(datasetKey);
        previousIdsRef.current.set(datasetKey, currentIds);
        return previousIds === undefined
          ? new Set<string>()
          : new Set([...currentIds].filter((id) => !previousIds.has(id)));
      })(),
    );
  }, [ready, world, retentionByNode, demoMode, controllerRef]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "0") {
        setDemoMode((value) => !value);
        return;
      }
      const jump = ["1", "2"].indexOf(event.key);
      if (jump >= 0) controllerRef.current?.devJump(jump);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controllerRef]);

  // The goal view is the palace's drill-in (spec 047) — it replaces the whole page and
  // returns to the exact map state on close (level/camera state lives in the controller
  // and is not reset by this swap... the Pixi app unmounts; cachedWorldModel keeps the
  // rebuild cheap and the world level is the natural landing).
  if (initFailed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-stone-50 text-stone-400">
        <span className="text-4xl">🏛️</span>
        <p className="text-sm">地图没有加载成功。离开这一页再回来，会重新尝试。</p>
      </div>
    );
  }
  if (world.islands.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-stone-50 text-stone-400">
        <span className="text-4xl">🏛️</span>
        <p className="text-sm">你的记忆宫殿还是一片海——去聊聊天，第一座岛屿会浮现</p>
        {import.meta.env.DEV && <p className="text-xs text-stone-300">DEV：按 0 载入演示海图</p>}
      </div>
    );
  }
  // Clicking a kingdom while dived into its island opens the kingdom's subway map — the
  // Pixi controller only navigates world→island itself, so this stays a plain DOM handler.
  function onCanvasClick() {
    if (level.kind !== "island" || hover === null || hover.kind !== "kingdom") return;
    const island = findIsland(world, level.islandId);
    const kingdom = island?.kingdoms.find((candidate) => candidate.nodeId === hover.nodeId);
    if (kingdom === undefined) return;
    setSubwayKingdom({
      nodeId: kingdom.nodeId,
      label: kingdom.label,
      memberNodeIds: kingdom.memberNodeIds,
    });
  }

  // The goal view and a kingdom's subway map cover the palace as overlays instead of
  // replacing it — the Pixi application initializes once per mount and its canvas would not
  // survive an unmount/remount of its container (spec 048 walkthrough finding).
  return (
    <div className="relative h-full w-full">
      <div className="flex h-full w-full overflow-hidden">
        {/* Square map hugging the left; the info panel takes the rest. */}
        <div className="relative aspect-square h-full shrink-0">
          {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: the Pixi canvas owns pointer semantics; this handler only augments its hover state */}
          <div
            ref={containerRef}
            className="h-full w-full overflow-hidden"
            onClick={onCanvasClick}
          />
          <div className="absolute left-3 top-3 z-10">
            <MapModeToggle />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <MapInfoPanel
            world={world}
            hover={hover}
            level={level}
            onOpenGoalView={() => setGoalViewOpen(true)}
          />
        </div>
      </div>
      {goalViewOpen && (
        <div className="absolute inset-0 z-20 bg-stone-50">
          <GoalView onClose={() => setGoalViewOpen(false)} />
        </div>
      )}
      {subwayKingdom !== null && (
        <div className="absolute inset-0 z-20 bg-stone-50">
          <KingdomSubwayView kingdom={subwayKingdom} onClose={() => setSubwayKingdom(null)} />
        </div>
      )}
    </div>
  );
}
