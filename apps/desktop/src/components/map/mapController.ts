/**
 * Purpose: imperative map controller — owns the world scene, the discrete level
 * state, exact-fit camera animation, wheel dives/backs and band fades. The village
 * dive level was removed 2026-08-11 (backup: branch backup/village-town-scene); the
 * kingdom view is now the deepest level. One instance per Application lifetime.
 * Main exports: createMapController, MapController.
 */
import type { WorldModel, WorldPoint } from "@breadcrumb/plugin-map";
import { type Application, Container } from "pixi.js";
import {
  type CameraFrame,
  findIsland,
  findKingdom,
  frameForLevel,
  hitIsland,
  hitIslet,
  hitKingdom,
  hitVillage,
  type MapLevel,
} from "./levels";
import type { MapArt } from "./mapArtAssets";
import { counterScaleLabels } from "./mapLabels";
import { buildWorldScene, type TapTarget, type WorldScene } from "./sceneBuild";

export interface HoverInfo {
  kind: "island" | "islet" | "kingdom" | "village";
  nodeId: string;
  label: string;
  memberCount: number;
  childCount: number;
  pointLabels: string[];
}

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
  kingdom: number;
  borders: number;
}

const WHEEL_COOLDOWN_MS = 380;

function bandsFor(level: MapLevel): BandTargets {
  if (level.kind === "world") return { world: 1, island: 0, kingdom: 0, borders: 0 };
  if (level.kind === "island") return { world: 0, island: 1, kingdom: 0, borders: 1 };
  return { world: 0, island: 0, kingdom: 1, borders: 1 };
}

export function createMapController(app: Application, art: MapArt, hooks: MapHooks): MapController {
  const worldRoot = new Container();
  app.stage.addChild(worldRoot);

  let world: WorldModel | null = null;
  let level: MapLevel = { kind: "world" };
  let cameraTarget: CameraFrame = { scale: 1, x: 0, y: 0 };
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
      controller.scene = buildWorldScene(nextWorld, retentionByNode, art, newNodeIds, onTap);
      worldRoot.addChild(controller.scene.root);
      if (!levelStillExists(nextWorld, level)) level = { kind: "world" };
      applyLevel(true);
    },
    devJump(depth) {
      if (world === null) return;
      const island = world.islands.at(0);
      const kingdom = island?.kingdoms.at(0);
      if (depth === 0) level = { kind: "world" };
      else if (depth === 1 && island) level = { kind: "island", islandId: island.nodeId };
      else if (island && kingdom)
        level = { kind: "kingdom", islandId: island.nodeId, kingdomId: kingdom.nodeId };
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
    return true;
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
    if (target.kind === "island") {
      level = { kind: "island", islandId: target.nodeId };
    } else {
      // A village tap lands on its kingdom — the deepest level since the village
      // dive was removed.
      for (const island of world.islands) {
        for (const kingdom of island.kingdoms) {
          if (kingdom.villages.some((village) => village.nodeId === target.nodeId)) {
            level = { kind: "kingdom", islandId: island.nodeId, kingdomId: kingdom.nodeId };
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
      if (island && kingdom !== null) {
        level = { kind: "kingdom", islandId: island.nodeId, kingdomId: kingdom.nodeId };
      }
    }
    applyLevel(false);
  }

  function back(): void {
    if (level.kind === "kingdom") level = { kind: "island", islandId: level.islandId };
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

  function hoverInfoAt(point: WorldPoint): HoverInfo | null {
    if (world === null) return null;
    if (level.kind === "world") {
      const island = hitIsland(world, point);
      if (island !== null) {
        return {
          kind: "island",
          nodeId: island.nodeId,
          label: island.label,
          memberCount: island.memberNodeIds.length,
          childCount: island.kingdoms.length,
          pointLabels: island.kingdoms.map((kingdom) => kingdom.label),
        };
      }
      // Nothing to dive into on an islet — the hover is the whole story it has.
      const islet = hitIslet(world, point);
      if (islet === null) return null;
      return {
        kind: "islet",
        nodeId: islet.nodeId,
        label: islet.label,
        memberCount: 1,
        childCount: 0,
        pointLabels: [islet.label],
      };
    }
    if (level.kind === "island") {
      const island = findIsland(world, level.islandId);
      const kingdom = island ? hitKingdom(island, point) : null;
      if (kingdom === null) return null;
      return {
        kind: "kingdom",
        nodeId: kingdom.nodeId,
        label: kingdom.label,
        memberCount: kingdom.memberNodeIds.length,
        childCount: kingdom.villages.length,
        pointLabels: kingdom.villages.flatMap((village) => [
          village.label,
          ...village.points.map((point) => point.label),
        ]),
      };
    }
    if (level.kind === "kingdom") {
      const island = findIsland(world, level.islandId);
      const kingdom = island ? findKingdom(island, level.kingdomId) : undefined;
      const village = kingdom ? hitVillage(kingdom, point) : null;
      if (village === null || village === undefined) return null;
      return {
        kind: "village",
        nodeId: village.nodeId,
        label: village.label,
        memberCount: village.memberNodeIds.length,
        childCount: village.points.length,
        pointLabels: village.points.map((point) => point.label),
      };
    }
    return null;
  }

  function onPointerMove(event: PointerEvent): void {
    const rect = app.canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    const info = hoverInfoAt(toWorldPoint(pointer.x, pointer.y));
    const infoId = info === null ? null : `${info.kind}:${info.nodeId}`;
    if (infoId !== lastHoverId) {
      lastHoverId = infoId;
      hooks.onHover(info);
    }
  }

  app.canvas.addEventListener("wheel", onWheel, { passive: false });
  app.canvas.addEventListener("pointermove", onPointerMove);
  app.renderer.on("resize", () => applyLevel(true));
  return controller;
}
