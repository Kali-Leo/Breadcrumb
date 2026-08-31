/**
 * Purpose: imperative map controller — owns the world scene, the discrete level state
 * (world → island, the deepest view since the kingdom and village dives were removed
 * 2026-08-11, backup: branch backup/village-town-scene), exact-fit camera animation,
 * wheel dive/back, band fades and the hover readout plus its highlight. Goal mode is not
 * handled here: MapView hands in a goal-filtered world model (goalWorldFilter.ts) and the
 * exact-fit framing refits to it automatically.
 * Main exports: createMapController, MapController, MapHooks.
 */
import type { WorldModel, WorldPoint } from "@breadcrumb/plugin-map";
import { type Application, Container, Graphics } from "pixi.js";
import { findIsland, frameForLevel, hitIsland, type MapLevel } from "./levels";
import type { MapArt } from "./mapArtAssets";
import { drawHoverHighlight, type HoverInfo, type HoverResult, resolveHover } from "./mapHover";
import { counterScaleLabels, setLabelEmphasis } from "./mapLabels";
import { buildWorldScene, type WorldScene } from "./sceneBuild";

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

export interface RecommendTarget {
  islandId: string;
  kingdomId: string | null;
}

const WHEEL_COOLDOWN_MS = 380;

/** The camera counts as arrived once its scale is within this fraction of the target —
 * that is when the level's content shows, all at once (Leo 2026-08-15: terrain-only
 * zoom, then everything immediately; no crossfade, no staggered reveal). */
const SETTLE_SCALE_RATIO = 0.04;

/** One level-transition in flight: the incoming band waits hidden until the camera lands. */
interface PendingAppear {
  band: Container;
  showBorders: boolean;
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
  let lastWheelAt = 0;
  let lastHoverId: string | null = null;
  const pointer = { x: 0, y: 0 };
  let lastRetention: ReadonlyMap<string, number> = new Map();
  let lastNewNodeIds: ReadonlySet<string> = new Set();
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

  function rebuildScene(): void {
    if (world === null) return;
    controller.scene?.root.destroy({ children: true });
    controller.scene = buildWorldScene(world, lastRetention, art, lastNewNodeIds, {
      width: app.screen.width,
      height: app.screen.height,
    });
    worldRoot.addChild(controller.scene.root);
    worldRoot.addChild(recommendLayer);
    drawRecommendMarkers();
  }

  /** Google Material Icons "place" (Apache-2.0) — the classic upside-down teardrop with a
   * hole (Leo 2026-08-31: 经典的地图选点标). Official asset used verbatim per the art
   * discipline's "官方资产直用" rule; only fill/stroke colors are ours (the map's amber
   * accent). 24×24 viewBox, tip at (12, ~21.5). */
  const PIN_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path fill="#f59e0b" stroke="#92400e" stroke-width="1" d="M12 2C8.13 2 5 5.13 5 8.5c0 ' +
    "5.25 7 13 7 13s7-7.75 7-13C19 5.13 15.87 2 12 2zm0 9.5c-1.66 0-3-1.34-3-3s1.34-3 3-3 " +
    '3 1.34 3 3-1.34 3-3 3z"/></svg>';

  /** One pin above the label of every place holding a visible recommendation on this level;
   * markers counter-scale in tick() so they keep their on-screen size like the names do. */
  function drawRecommendMarkers(): void {
    for (const child of recommendLayer.removeChildren()) child.destroy({ children: true });
    const scene = controller.scene;
    if (scene === null || recommendTargets.length === 0) return;
    const targetNodeIds = new Set<string>();
    for (const target of recommendTargets) {
      const nodeId =
        level.kind === "world"
          ? target.islandId
          : level.islandId === target.islandId
            ? target.kingdomId
            : null;
      if (nodeId !== null) targetNodeIds.add(nodeId);
    }
    for (const targetNodeId of targetNodeIds) {
      const label = scene.labels.find((candidate) => candidate.nodeId === targetNodeId);
      if (label === undefined) continue;
      const marker = new Container();
      marker.position.set(label.text.x, label.text.y - 10);
      const pin = new Graphics().svg(PIN_SVG);
      // Tip of the teardrop sits on the container origin, pointing at the place name.
      pin.position.set(-12, -21.5);
      marker.addChild(pin);
      recommendLayer.addChild(marker);
    }
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
      drawRecommendMarkers();
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
      advancePendingAppear();
    },
    destroy() {
      app.canvas.removeEventListener("wheel", onWheel);
      app.canvas.removeEventListener("click", onClick);
      app.canvas.removeEventListener("pointermove", onPointerMove);
    },
  };

  /** Snap path: both bands and the borders jump straight to the level's end state. */
  function applyBandsInstant(scene: WorldScene): void {
    const atIsland = level.kind === "island";
    scene.worldBand.visible = !atIsland;
    scene.worldBand.alpha = atIsland ? 0 : 1;
    scene.islandBand.visible = atIsland;
    scene.islandBand.alpha = atIsland ? 1 : 0;
    scene.bordersLayer.visible = atIsland;
    scene.bordersLayer.alpha = atIsland ? 1 : 0;
  }

  /** Animated path: everything level-bound hides for the ride and the incoming band
   * (plus borders at the island level) shows in full once the camera lands. */
  function beginAppearTransition(scene: WorldScene): void {
    const atIsland = level.kind === "island";
    scene.worldBand.visible = false;
    scene.islandBand.visible = false;
    scene.bordersLayer.visible = false;
    pendingAppear = {
      band: atIsland ? scene.islandBand : scene.worldBand,
      showBorders: atIsland,
    };
  }

  function advancePendingAppear(): void {
    const pending = pendingAppear;
    const scene = controller.scene;
    if (pending === null || scene === null) return;
    const settled =
      Math.abs(worldRoot.scale.x - cameraTarget.scale) <= cameraTarget.scale * SETTLE_SCALE_RATIO;
    if (!settled) return;
    pending.band.visible = true;
    pending.band.alpha = 1;
    if (pending.showBorders) {
      scene.bordersLayer.visible = true;
      scene.bordersLayer.alpha = 1;
    }
    pendingAppear = null;
  }

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
      if (snap) applyBandsInstant(scene);
      else beginAppearTransition(scene);
      drawRecommendMarkers();
    }
    if (snap) {
      worldRoot.scale.set(cameraTarget.scale);
      worldRoot.position.set(cameraTarget.x, cameraTarget.y);
    }
    hooks.onLevel(level);
  }

  function toWorldPoint(screenX: number, screenY: number): WorldPoint {
    return {
      x: (screenX - worldRoot.position.x) / worldRoot.scale.x,
      y: (screenY - worldRoot.position.y) / worldRoot.scale.x,
    };
  }

  /** A click anywhere on an island's region navigates — same hit test as the wheel dive. */
  function onClick(event: MouseEvent): void {
    if (world === null || level.kind !== "world") return;
    const rect = app.canvas.getBoundingClientRect();
    const point = toWorldPoint(event.clientX - rect.left, event.clientY - rect.top);
    const island = hitIsland(world, point);
    if (island === null) return;
    level = { kind: "island", islandId: island.nodeId };
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
  app.canvas.addEventListener("click", onClick);
  app.canvas.addEventListener("pointermove", onPointerMove);
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
