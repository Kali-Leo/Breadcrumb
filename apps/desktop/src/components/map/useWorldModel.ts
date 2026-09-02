/**
 * Purpose: the palace's world model — islands are derived continents once the async
 * assignment loads (tree roots first, clustering only for the flat leftovers, spec 031);
 * until then the tree-root fallback renders, which is fine and intended, and AI continent
 * names (when that switch is on) patch in a moment later. The model is cached per (nodes,
 * assignment) pair so re-opening the palace skips the expensive terrain build (identical
 * output, just remembered). Goal mode redraws to the goal's cut via goalWorldFilter (hide
 * places without goal nodes; the camera refit follows from the smaller world) — a positional
 * re-layout is deliberately off the table, island positions stay stable across modes.
 * Main exports: WorldModelState, useWorldModel.
 */
import type { ContinentAssignment, WorldModel } from "@breadcrumb/feature-map";
import { useEffect, useMemo, useState } from "react";
import { loadContinentAssignment } from "../../lib/map/mapContinentActions";
import { applyAiContinentNames } from "../../lib/map/mapNamingActions";
import { applyPlaceNames } from "../../lib/map/placeNames";
import { goalNodeIds as parseGoalNodeIds } from "../../lib/planner/plannerGapActions";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import { useMapPlaceNameStore } from "../../stores/mapPlaceNameStore";
import { useMemoryStore } from "../../stores/memoryStore";
import { usePlannerStore } from "../../stores/plannerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { demoKnowledgeNodes, demoRetentionByNode } from "./demoWorld";
import { filterWorldToGoal } from "./goalWorldFilter";
import { cachedWorldModel } from "./mapWorldCache";

export interface WorldModelState {
  /** The full world — new-node reveals diff against this so leaving goal mode never
   * replays them. */
  world: WorldModel;
  /** What the controller draws: the goal's cut in goal mode, otherwise the full world. */
  displayWorld: WorldModel;
  goalScope: { title: string; nodeIds: ReadonlySet<string> } | null;
  retentionByNode: ReadonlyMap<string, number>;
}

export function useWorldModel(demoMode: boolean): WorldModelState {
  const storeNodes = useKnowledgeStore((state) => state.nodes);
  const storeRetention = useMemoryStore((state) => state.retentionByNode);
  const [continentAssignment, setContinentAssignment] = useState<ContinentAssignment | null>(null);

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
  // The learner's own place names go on last — over the tree labels and over the AI names —
  // so a rename always shows, and shows the moment it is saved: the daily freeze covers
  // positions and sizes only, and applyPlaceNames never touches those.
  const placeNames = useMapPlaceNameStore((state) => state.names);
  useEffect(() => {
    void useMapPlaceNameStore.getState().load();
  }, []);
  const world = useMemo(
    () => applyPlaceNames(cachedWorldModel(nodes, effectiveAssignment), placeNames),
    [nodes, effectiveAssignment, placeNames],
  );

  // Goal mode redraws the map to the goal's cut (Leo: 目标截取的树意味着目标地图要重绘):
  // places with zero goal nodes are removed from the world handed to the controller, and
  // the exact-fit framing refits to what remains. A goal touching no place keeps the full
  // map (nothing to frame otherwise). Leaving goal mode restores the full world.
  const goals = usePlannerStore((state) => state.goals);
  const selectedGoalId = usePlannerStore((state) => state.selectedGoalId);
  const learningMode = useSettingsStore((state) => state.learningMode);
  const { displayWorld, goalScope } = useMemo(() => {
    const goal =
      learningMode === "ranked"
        ? (goals.find((candidate) => candidate.id === selectedGoalId) ?? null)
        : null;
    if (goal === null || demoMode) return { displayWorld: world, goalScope: null };
    const goalNodeIds: ReadonlySet<string> = new Set(parseGoalNodeIds(goal));
    const cut = filterWorldToGoal(world, goalNodeIds);
    return {
      displayWorld: cut.islands.length === 0 ? world : cut,
      goalScope: { title: goal.title, nodeIds: goalNodeIds },
    };
  }, [world, learningMode, goals, selectedGoalId, demoMode]);

  return { world, displayWorld, goalScope, retentionByNode };
}
