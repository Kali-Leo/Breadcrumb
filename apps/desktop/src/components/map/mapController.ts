/**
 * Purpose: imperative map controller — owns the world scene, the discrete level
 * state, exact-fit camera animation, wheel dives/backs, band fades and the village
 * town-scene overlay. One instance per Application lifetime.
 * Main exports: createMapController, MapController.
 */
import type { WorldModel, WorldPoint } from "@breadcrumb/plugin-map";
import { type Application, Container } from "pixi.js";
import {
  type CameraFrame,
  findIsland,
  findKingdom,
  findVillage,
  frameForLevel,
  hitIsland,
  hitKingdom,
  hitVillage,
  type MapLevel,
} from "./levels";
import type { MapArt } from "./mapArtAssets";
import { counterScaleLabels } from "./mapLabels";
import { buildWorldScene, type TapTarget, type WorldScene } from "./sceneBuild";
import { buildTownScene } from "./townScene";

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
  kingdom: number;
  borders: number;
}

const WHEEL_COOLDOWN_MS = 380;

function bandsFor(level: MapLevel): BandTargets {
  if (level.kind === "world") return { world: 1, island: 0, kingdom: 0, borders: 0 };
  if (level.kind === "island") return { world: 0, island: 1, kingdom: 0, borders: 1 };
  return { world: 0, island: 0, kingdom: 1, borders: 1 };
}

export function createMapController(app: Application, art: MapArt): MapController {
  const worldRoot = new Container();
  app.stage.addChild(worldRoot);

  let world: WorldModel | null = null;
  let level: MapLevel = { kind: "world" };
  let cameraTarget: CameraFrame = { scale: 1, x: 0, y: 0 };
  let bandTargets: BandTargets = bandsFor(level);
  let overlay: Container | null = null;
  let overlayTarget = 0;
  let lastWheelAt = 0;
  const pointer = { x: 0, y: 0 };

  const controller: MapController = {
    scene: null,
    footprintPhase: 0,
    setWorld(nextWorld, retentionByNode, newNodeIds) {
      world = nextWorld;
      controller.scene?.root.destroy({ children: true });
      controller.scene = buildWorldScene(nextWorld, retentionByNode, art, newNodeIds, onTap);
      worldRoot.addChild(controller.scene.root);
      if (!levelStillExists(nextWorld, level)) level = { kind: "world" };
      applyLevel(true);
    },
    devJump(depth) {
      if (world === null) return;
      const island = world.islands.at(0);
      const kingdom = island?.kingdoms.at(0);
      const village = kingdom?.villages.at(0);
      if (depth === 0) level = { kind: "world" };
      else if (depth === 1 && island) level = { kind: "island", islandId: island.nodeId };
      else if (depth === 2 && island && kingdom)
        level = { kind: "kingdom", islandId: island.nodeId, kingdomId: kingdom.nodeId };
      else if (island && kingdom && village)
        level = {
          kind: "village",
          islandId: island.nodeId,
          kingdomId: kingdom.nodeId,
          villageId: village.nodeId,
        };
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
        fadeTo(scene.kingdomBand, bandTargets.kingdom, ease);
        fadeTo(scene.bordersLayer, bandTargets.borders, ease);
      }
      if (overlay !== null) {
        overlay.alpha += (overlayTarget - overlay.alpha) * ease;
        if (overlayTarget === 0 && overlay.alpha < 0.02) {
          overlay.destroy({ children: true });
          overlay = null;
        }
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

  function levelStillExists(nextWorld: WorldModel, current: MapLevel): boolean {
    if (current.kind === "world") return true;
    const island = findIsland(nextWorld, current.islandId);
    if (island === undefined) return false;
    if (current.kind === "island") return true;
    const kingdom = findKingdom(island, current.kingdomId);
    if (kingdom === undefined) return false;
    if (current.kind === "kingdom") return true;
    return findVillage(kingdom, current.villageId) !== undefined;
  }

  function applyLevel(snap: boolean): void {
    if (world === null) return;
    cameraTarget = frameForLevel(world, level, app.screen.width, app.screen.height);
    bandTargets = bandsFor(level);
    if (controller.scene !== null) {
      counterScaleLabels(controller.scene.labelSets, cameraTarget.scale);
    }
    if (snap) {
      worldRoot.scale.set(cameraTarget.scale);
      worldRoot.position.set(cameraTarget.x, cameraTarget.y);
      const scene = controller.scene;
      if (scene !== null) {
        scene.worldBand.alpha = bandTargets.world;
        scene.islandBand.alpha = bandTargets.island;
        scene.kingdomBand.alpha = bandTargets.kingdom;
        scene.bordersLayer.alpha = bandTargets.borders;
      }
    }
    // Village level = an independent full-window town scene above the world.
    if (level.kind === "village") {
      const island = findIsland(world, level.islandId);
      const kingdom = island ? findKingdom(island, level.kingdomId) : undefined;
      const village = kingdom ? findVillage(kingdom, level.villageId) : undefined;
      if (village !== undefined && overlay === null) {
        overlay = buildTownScene(village, app.screen.width, app.screen.height);
        overlay.alpha = 0;
        app.stage.addChild(overlay);
      }
      overlayTarget = 1;
    } else {
      overlayTarget = 0;
    }
  }

  function toWorldPoint(screenX: number, screenY: number): WorldPoint {
    return {
      x: (screenX - worldRoot.position.x) / worldRoot.scale.x,
      y: (screenY - worldRoot.position.y) / worldRoot.scale.x,
    };
  }

  function onTap(target: TapTarget): void {
    if (world === null) return;
    if (target.kind === "island") {
      level = { kind: "island", islandId: target.nodeId };
    } else {
      for (const island of world.islands) {
        for (const kingdom of island.kingdoms) {
          if (kingdom.villages.some((village) => village.nodeId === target.nodeId)) {
            level = {
              kind: "village",
              islandId: island.nodeId,
              kingdomId: kingdom.nodeId,
              villageId: target.nodeId,
            };
          }
        }
      }
    }
    applyLevel(false);
  }

  function dive(): void {
    if (world === null) return;
    const point = toWorldPoint(pointer.x, pointer.y);
    if (level.kind === "world") {
      const island = hitIsland(world, point);
      if (island !== null) level = { kind: "island", islandId: island.nodeId };
    } else if (level.kind === "island") {
      const island = findIsland(world, level.islandId);
      const kingdom = island ? hitKingdom(island, point) : null;
      if (island && kingdom !== null)
        level = { kind: "kingdom", islandId: island.nodeId, kingdomId: kingdom.nodeId };
    } else if (level.kind === "kingdom") {
      const island = findIsland(world, level.islandId);
      const kingdom = island ? findKingdom(island, level.kingdomId) : undefined;
      const village = kingdom ? hitVillage(kingdom, point) : null;
      if (kingdom && village !== null) {
        level = { ...level, kind: "village", villageId: village.nodeId };
      }
    }
    applyLevel(false);
  }

  function back(): void {
    if (level.kind === "village")
      level = { kind: "kingdom", islandId: level.islandId, kingdomId: level.kingdomId };
    else if (level.kind === "kingdom") level = { kind: "island", islandId: level.islandId };
    else if (level.kind === "island") level = { kind: "world" };
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
    const rect = app.canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  }

  app.canvas.addEventListener("wheel", onWheel, { passive: false });
  app.canvas.addEventListener("pointermove", onPointerMove);
  app.renderer.on("resize", () => applyLevel(true));
  return controller;
}
