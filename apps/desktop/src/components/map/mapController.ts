/**
 * Purpose: imperative map controller — owns the world scene, the discrete level state
 * (world → island, the deepest view since the kingdom and village dives were removed
 * 2026-08-11, backup: branch backup/village-town-scene), exact-fit camera animation,
 * wheel dive/back, band fades and the hover readout plus its highlight.
 * Main exports: createMapController, MapController, MapHooks.
 */
import type { WorldModel, WorldPoint } from "@breadcrumb/plugin-map";
import { type Application, Container } from "pixi.js";
import { findIsland, frameForLevel, hitIsland, type MapLevel } from "./levels";
import type { MapArt } from "./mapArtAssets";
import { drawHoverHighlight, type HoverInfo, type HoverResult, resolveHover } from "./mapHover";
import { counterScaleLabels } from "./mapLabels";
import { buildWorldScene, type TapTarget, type WorldScene } from "./sceneBuild";

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
  devJump(depth: number): void;
  tick(deltaSeconds: number): void;
  destroy(): void;
}

interface BandTargets {
  world: number;
  island: number;
  borders: number;
}

const WHEEL_COOLDOWN_MS = 380;

function bandsFor(level: MapLevel): BandTargets {
  if (level.kind === "world") return { world: 1, island: 0, borders: 0 };
  return { world: 0, island: 1, borders: 1 };
}

export function createMapController(app: Application, art: MapArt, hooks: MapHooks): MapController {
  const worldRoot = new Container();
  app.stage.addChild(worldRoot);

  let world: WorldModel | null = null;
  let level: MapLevel = { kind: "world" };
  let cameraTarget = { scale: 1, x: 0, y: 0 };
  let bandTargets: BandTargets = bandsFor(level);
  let lastWheelAt = 0;
  let lastHoverId: string | null = null;
  const pointer = { x: 0, y: 0 };

  const controller: MapController = {
    scene: null,
    footprintPhase: 0,
    setWorld(nextWorld, retentionByNode, newNodeIds) {
      world = nextWorld;
      controller.scene?.root.destroy({ children: true });
      controller.scene = buildWorldScene(nextWorld, retentionByNode, art, newNodeIds, onTap, {
        width: app.screen.width,
        height: app.screen.height,
      });
      worldRoot.addChild(controller.scene.root);
      if (level.kind === "island" && findIsland(nextWorld, level.islandId) === undefined) {
        level = { kind: "world" };
      }
      applyLevel(true);
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
      const scene = controller.scene;
      if (scene !== null) {
        fadeTo(scene.worldBand, bandTargets.world, ease);
        fadeTo(scene.islandBand, bandTargets.island, ease);
        fadeTo(scene.bordersLayer, bandTargets.borders, ease);
      }
    },
    destroy() {
      app.canvas.removeEventListener("wheel", onWheel);
      app.canvas.removeEventListener("pointermove", onPointerMove);
    },
  };

  function fadeTo(container: Container, target: number, ease: number): void {
    container.alpha += (target - container.alpha) * ease;
    container.visible = container.alpha > 0.02 || target > 0;
  }

  function showHover(hover: HoverResult | null): void {
    lastHoverId = hover === null ? null : `${hover.info.kind}:${hover.info.nodeId}`;
    if (controller.scene !== null) drawHoverHighlight(controller.scene.highlightLayer, hover);
    hooks.onHover(hover === null ? null : hover.info);
  }

  function applyLevel(snap: boolean): void {
    if (world === null) return;
    cameraTarget = frameForLevel(world, level, app.screen.width, app.screen.height);
    bandTargets = bandsFor(level);
    // What the pointer was over belongs to the level we just left.
    showHover(null);
    if (controller.scene !== null) {
      counterScaleLabels(controller.scene.labels, cameraTarget.scale);
    }
    if (snap) {
      worldRoot.scale.set(cameraTarget.scale);
      worldRoot.position.set(cameraTarget.x, cameraTarget.y);
      const scene = controller.scene;
      if (scene !== null) {
        scene.worldBand.alpha = bandTargets.world;
        scene.islandBand.alpha = bandTargets.island;
        scene.bordersLayer.alpha = bandTargets.borders;
      }
    }
    hooks.onLevel(level);
  }

  function toWorldPoint(screenX: number, screenY: number): WorldPoint {
    return {
      x: (screenX - worldRoot.position.x) / worldRoot.scale.x,
      y: (screenY - worldRoot.position.y) / worldRoot.scale.x,
    };
  }

  function onTap(target: TapTarget): void {
    if (world === null) return;
    level = { kind: "island", islandId: target.nodeId };
    applyLevel(false);
  }

  /** The island level is the deepest view, so a dive there simply has nowhere to go. */
  function dive(): void {
    if (world === null || level.kind !== "world") return;
    const island = hitIsland(world, toWorldPoint(pointer.x, pointer.y));
    if (island === null) return;
    level = { kind: "island", islandId: island.nodeId };
    applyLevel(false);
  }

  function back(): void {
    if (level.kind !== "island") return;
    level = { kind: "world" };
    applyLevel(false);
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    const now = performance.now();
    if (now - lastWheelAt < WHEEL_COOLDOWN_MS) return;
    lastWheelAt = now;
    if (event.deltaY > 0) back();
    else dive();
  }

  function onPointerMove(event: PointerEvent): void {
    if (world === null) return;
    const rect = app.canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    const hover = resolveHover(world, level, toWorldPoint(pointer.x, pointer.y));
    const hoverId = hover === null ? null : `${hover.info.kind}:${hover.info.nodeId}`;
    if (hoverId !== lastHoverId) showHover(hover);
  }

  app.canvas.addEventListener("wheel", onWheel, { passive: false });
  app.canvas.addEventListener("pointermove", onPointerMove);
  app.renderer.on("resize", () => applyLevel(true));
  return controller;
}
