/**
 * Purpose: imperative map controller — owns the world scene, the discrete level state
 * (world → island, the deepest view since the kingdom and village dives were removed
 * 2026-08-11, backup: branch backup/village-town-scene), exact-fit camera animation and the
 * hover readout plus its highlight. Band fades live in mapBands, the recommendation pins in
 * mapRecommendPins, and pointer input in mapNavigation. Goal mode is not handled here:
 * MapView hands in a goal-filtered world model (goalWorldFilter.ts) and the exact-fit
 * framing refits to it automatically.
 * Main exports: createMapController, MapController, MapHooks.
 *
 * Directory note: the non-component .ts files in components/map/ are the Pixi rendering
 * layer and belong to the view layer; logic with no DOM or Pixi lives in lib/.
 */
import type { WorldModel } from "@breadcrumb/feature-map";
import { type Application, Container } from "pixi.js";
import { findIsland, frameForLevel, type MapLevel } from "./levels";
import type { MapArt } from "./mapArtAssets";
import {
  advancePendingAppear,
  applyBandsInstant,
  beginAppearTransition,
  type PendingAppear,
} from "./mapBands";
import { drawHoverHighlight, type HoverInfo, type HoverResult } from "./mapHover";
import { counterScaleLabels, setLabelEmphasis } from "./mapLabels";
import { createMapNavigation } from "./mapNavigation";
import { drawRecommendMarkers, type RecommendTarget } from "./mapRecommendPins";
import { buildWorldScene, type WorldScene } from "./sceneBuild";

export type { RecommendTarget };

export interface MapHooks {
  onHover(info: HoverInfo | null): void;
  onLevel(level: MapLevel): void;
}

export interface MapController {
  scene: WorldScene | null;
  footprintPhase: number;
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
  let lastHoverId: string | null = null;
  let lastRetention: ReadonlyMap<string, number> = new Map();
  let lastNewNodeIds: ReadonlySet<string> = new Set();
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

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

  const controller: MapController = {
    scene: null,
    footprintPhase: 0,
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
      const ease = 1 - Math.exp(-deltaSeconds * 7);
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
      app.canvas.removeEventListener("wheel", navigation.onWheel);
      app.canvas.removeEventListener("click", navigation.onClick);
      app.canvas.removeEventListener("pointermove", navigation.onPointerMove);
    },
  };

  function showHover(hover: HoverResult | null): void {
    lastHoverId = hover === null ? null : `${hover.info.kind}:${hover.info.nodeId}`;
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

  const navigation = createMapNavigation({
    app,
    worldRoot,
    getWorld: () => world,
    getLevel: () => level,
    goToLevel(next) {
      level = next;
      applyLevel(false);
    },
    showHover,
    currentHoverId: () => lastHoverId,
  });

  app.canvas.addEventListener("wheel", navigation.onWheel, { passive: false });
  app.canvas.addEventListener("click", navigation.onClick);
  app.canvas.addEventListener("pointermove", navigation.onPointerMove);
  // Label placement is computed against the screen size, so a resize must re-place the
  // names (debounced) — stale positions are how names end up lying on each other.
  app.renderer.on("resize", () => {
    applyLevel(true);
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      rebuildScene();
      applyLevel(true);
    }, 200);
  });
  return controller;
}
