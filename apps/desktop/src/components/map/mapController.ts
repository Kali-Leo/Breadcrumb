/**
 * Purpose: imperative map controller — owns the world scene, the discrete level state
 * (world → island, the deepest view since the kingdom and village dives were removed
 * 2026-08-11, backup: branch backup/village-town-scene), exact-fit camera animation and the
 * hover readout plus its highlight. Band fades live in mapBands, the recommendation pins in
 * mapRecommendPins, pointer input in mapNavigation and the DOM/renderer subscriptions in
 * mapControllerEvents. Goal mode is not handled here:
 * MapView hands in a goal-filtered world model (goalWorldFilter.ts) and the exact-fit
 * framing refits to it automatically.
 * Main exports: createMapController, MapController, MapHooks.
 */
import type { WorldModel } from "@breadcrumb/feature-map";
import { type Application, Container } from "pixi.js";
import { CAMERA_EASE_RATE, findIsland, frameForLevel, type MapLevel } from "./levels";
import type { MapArt } from "./mapArtAssets";
import {
  advancePendingAppear,
  applyBandsInstant,
  beginAppearTransition,
  type PendingAppear,
} from "./mapBands";
import { bindMapEvents } from "./mapControllerEvents";
import { drawHoverHighlight, type HoverInfo, type HoverResult } from "./mapHover";
import { counterScaleLabels, setLabelEmphasis } from "./mapLabels";
import { createMapNavigation, type MapNavigation, readStampedInputMode } from "./mapNavigation";
import { drawRecommendMarkers, type RecommendTarget } from "./mapRecommendPins";
import { buildWorldScene, type WorldScene } from "./sceneBuild";

export type { RecommendTarget };

export interface MapHooks {
  /** What the map points at: the mouse's hover, or a finger's tap selection. */
  onHover(info: HoverInfo | null): void;
  onLevel(level: MapLevel): void;
  /** A kingdom entered at the island level — its subway map is a DOM overlay (MapView). */
  onEnterKingdom(nodeId: string): void;
}

export interface MapController {
  scene: WorldScene | null;
  footprintPhase: number;
  /** The input grammar (tap/click/wheel/pinch verbs) for the DOM chrome to call into. */
  navigation: MapNavigation;
  setWorld(
    world: WorldModel,
    retentionByNode: ReadonlyMap<string, number>,
    newNodeIds: ReadonlySet<string>,
  ): void;
  /** Marks where the visible recommendation set lives (spec 048 follow-up + spec 060 §2,
   * Leo: pins on every zoom level) — the containing islands at the world level, the
   * containing kingdoms once dived into an island. One pin per place, however many
   * candidates it holds. */
  setRecommendTargets(targets: readonly RecommendTarget[]): void;
  devJump(depth: number): void;
  tick(deltaSeconds: number): void;
  destroy(): void;
}

export function createMapController(app: Application, art: MapArt, hooks: MapHooks): MapController {
  const worldRoot = new Container();
  app.stage.addChild(worldRoot);
  // The recommendation bubble rides above every band; re-appended on rebuild to stay on top.
  const recommendLayer = new Container();
  worldRoot.addChild(recommendLayer);
  let recommendTargets: readonly RecommendTarget[] = [];

  let world: WorldModel | null = null;
  let level: MapLevel = { kind: "world" };
  let cameraTarget = { scale: 1, x: 0, y: 0 };
  let pendingAppear: PendingAppear | null = null;
  let lastHover: HoverInfo | null = null;
  let lastRetention: ReadonlyMap<string, number> = new Map();
  let lastNewNodeIds: ReadonlySet<string> = new Set();
  let unbindEvents: (() => void) | null = null;

  function paintRecommendMarkers(): void {
    drawRecommendMarkers(recommendLayer, controller.scene, level, recommendTargets);
  }

  function rebuildScene(): void {
    if (world === null) return;
    controller.scene?.root.destroy({ children: true });
    controller.scene = buildWorldScene(world, lastRetention, art, lastNewNodeIds, {
      width: app.screen.width,
      height: app.screen.height,
    });
    worldRoot.addChild(controller.scene.root);
    worldRoot.addChild(recommendLayer);
    paintRecommendMarkers();
  }

  const navigation = createMapNavigation({
    app,
    getWorld: () => world,
    getLevel: () => level,
    getCameraTarget: () => cameraTarget,
    goToLevel(next) {
      level = next;
      applyLevel(false);
    },
    enterKingdom: (nodeId) => hooks.onEnterKingdom(nodeId),
    showHover,
    currentHover: () => lastHover,
    getInputMode: readStampedInputMode,
  });

  const controller: MapController = {
    scene: null,
    footprintPhase: 0,
    navigation,
    setWorld(nextWorld, retentionByNode, newNodeIds) {
      world = nextWorld;
      lastRetention = retentionByNode;
      lastNewNodeIds = newNodeIds;
      rebuildScene();
      if (level.kind === "island" && findIsland(nextWorld, level.islandId) === undefined) {
        level = { kind: "world" };
      }
      applyLevel(true);
    },
    setRecommendTargets(targets) {
      recommendTargets = targets;
      paintRecommendMarkers();
    },
    devJump(depth) {
      if (world === null) return;
      const island = world.islands.at(0);
      level =
        depth >= 1 && island ? { kind: "island", islandId: island.nodeId } : { kind: "world" };
      applyLevel(false);
    },
    tick(deltaSeconds) {
      const ease = 1 - Math.exp(-deltaSeconds * CAMERA_EASE_RATE);
      worldRoot.scale.x += (cameraTarget.scale - worldRoot.scale.x) * ease;
      worldRoot.scale.y = worldRoot.scale.x;
      worldRoot.position.x += (cameraTarget.x - worldRoot.position.x) * ease;
      worldRoot.position.y += (cameraTarget.y - worldRoot.position.y) * ease;
      for (const marker of recommendLayer.children) {
        marker.scale.set(1 / worldRoot.scale.x);
      }
      pendingAppear = advancePendingAppear({
        pending: pendingAppear,
        scene: controller.scene,
        currentScale: worldRoot.scale.x,
        targetScale: cameraTarget.scale,
      });
    },
    destroy() {
      unbindEvents?.();
      unbindEvents = null;
    },
  };

  function showHover(hover: HoverResult | null): void {
    lastHover = hover === null ? null : hover.info;
    if (controller.scene !== null) {
      drawHoverHighlight(controller.scene.highlightLayer, hover);
      // The hovered land's name lights up with it — a name that drifted to open water
      // still snaps back to its owner in the reader's eye.
      setLabelEmphasis(controller.scene.labels, hover === null ? null : hover.info.nodeId);
    }
    hooks.onHover(hover === null ? null : hover.info);
  }

  function applyLevel(snap: boolean): void {
    if (world === null) return;
    cameraTarget = frameForLevel(world, level, app.screen.width, app.screen.height);
    // What the pointer was over belongs to the level we just left.
    showHover(null);
    const scene = controller.scene;
    if (scene !== null) {
      counterScaleLabels(scene.labels, cameraTarget.scale);
      pendingAppear = null;
      if (snap) applyBandsInstant(scene, level);
      else pendingAppear = beginAppearTransition(scene, level);
      paintRecommendMarkers();
    }
    if (snap) {
      worldRoot.scale.set(cameraTarget.scale);
      worldRoot.position.set(cameraTarget.x, cameraTarget.y);
    }
    hooks.onLevel(level);
  }

  unbindEvents = bindMapEvents(app, navigation, {
    reframe: () => applyLevel(true),
    replace: () => {
      rebuildScene();
      applyLevel(true);
    },
  });
  return controller;
}
