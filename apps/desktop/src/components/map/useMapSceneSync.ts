/**
 * Purpose: keeps the Pixi controller in step with the React data — the recommendation pins,
 * the scene rebuild on data changes (the renderer and camera model stay alive), and the DEV
 * keyboard jumps. Nothing here draws; it hands the controller what changed.
 * Main exports: useMapSceneSync.
 */
import type { WorldModel } from "@breadcrumb/feature-map";
import { visibleFrontier } from "@breadcrumb/feature-planner";
import { type Dispatch, type RefObject, type SetStateAction, useEffect, useRef } from "react";
import { usePlannerStore } from "../../stores/plannerStore";
import type { MapController } from "./mapController";

export function useMapSceneSync(input: {
  ready: boolean;
  controllerRef: RefObject<MapController | null>;
  /** The FULL world — new-node reveals diff against it. */
  world: WorldModel;
  /** What the controller draws (the goal's cut in goal mode). */
  displayWorld: WorldModel;
  retentionByNode: ReadonlyMap<string, number>;
  demoMode: boolean;
  /** The DEV "0" key flips the demo dataset; the setter's stable identity keeps the key
   * listener subscribed once. */
  setDemoMode: Dispatch<SetStateAction<boolean>>;
}): void {
  const { ready, controllerRef, world, displayWorld, retentionByNode, demoMode } = input;
  const previousIdsRef = useRef(new Map<string, ReadonlySet<string>>());

  // The visible recommendation set surfaces as map pins on every level (Leo's design +
  // spec 060 §2): the containing islands at the world level, the containing kingdoms once
  // dived in; the kingdom tree then rings the node itself. Demo worlds never match real
  // planner ids, so the pins rest.
  const frontierCandidates = usePlannerStore((state) => state.frontierCandidates);
  useEffect(() => {
    if (!ready) return;
    const targets: { islandId: string; kingdomId: string | null }[] = [];
    for (const candidate of visibleFrontier(frontierCandidates)) {
      const island = displayWorld.islands.find((somewhere) =>
        somewhere.memberNodeIds.includes(candidate.nodeId),
      );
      if (island === undefined) continue;
      const kingdom = island.kingdoms.find((somewhere) =>
        somewhere.memberNodeIds.includes(candidate.nodeId),
      );
      targets.push({ islandId: island.nodeId, kingdomId: kingdom?.nodeId ?? null });
    }
    controllerRef.current?.setRecommendTargets(targets);
  }, [ready, frontierCandidates, displayWorld, controllerRef]);

  // Scene rebuilds on data changes; the renderer and camera model stay alive. New-node
  // reveals diff against the FULL world so leaving goal mode never replays them.
  useEffect(() => {
    if (!ready) return;
    controllerRef.current?.setWorld(
      displayWorld,
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
  }, [ready, world, displayWorld, retentionByNode, demoMode, controllerRef]);

  const setDemoMode = input.setDemoMode;
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
  }, [controllerRef, setDemoMode]);
}
