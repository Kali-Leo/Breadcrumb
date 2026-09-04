/**
 * Purpose: the map canvas's pointer input — screen→world conversion, the dive into an island
 * (the island level is the deepest view, so a dive there simply has nowhere to go), the way
 * back out, the hover readout's pointer tracking, and the hand-off into a kingdom's subway
 * map. Owns no Pixi objects and no level state: it reads the controller's world/level and
 * asks it to navigate.
 *
 * Two input grammars, one camera model. With a mouse the pointer's position is the readout
 * (hover) and a click goes straight in. With a finger there is no hover, so a tap SELECTS —
 * the same amber wash and rail card the mouse gets for free — and a second tap on the same
 * place enters it; a tap on open sea clears the selection. The selection reuses the hover
 * channel, so the rail never needs to know which hand drove it (touch-audit 2.2).
 * Main exports: MapNavigation, createMapNavigation.
 *
 * Directory note: the non-component .ts files in components/map/ are the Pixi rendering
 * layer and belong to the view layer; logic with no DOM or Pixi lives in lib/.
 */
import type { WorldModel, WorldPoint } from "@breadcrumb/feature-map";
import type { Application } from "pixi.js";
import type { InputMode } from "../../lib/platform/inputMode";
import { CAMERA_SETTLE_MS, type CameraFrame, hitIsland, type MapLevel } from "./levels";
import { type HoverInfo, type HoverResult, resolveHover } from "./mapHover";

/** One wheel notch per camera flight. The map has no free zoom: a notch is a whole level
 * change, and until the camera has arrived the picture on screen is not yet the level the
 * next notch would act on. Tied to the settle time rather than a hand-picked number so the
 * two can never drift apart (bug hunt 2026-09-03). */
const WHEEL_COOLDOWN_MS = CAMERA_SETTLE_MS;

/** The answer lib/platform/inputMode stamps on <html> — read, never re-derived, so the map
 * and its CSS (`coarse:`) can never disagree about which hand is driving. */
export function readStampedInputMode(): InputMode {
  return globalThis.document?.documentElement.dataset.input === "coarse" ? "coarse" : "fine";
}

export interface MapNavigation {
  onWheel(event: WheelEvent): void;
  onClick(event: MouseEvent): void;
  onPointerMove(event: PointerEvent): void;
  /** One level out (island → world); nothing to do at the world level. */
  back(): void;
  /** Into a place the rail or a tap already named: an island dives, a kingdom opens its
   * subway map, an islet has nowhere to go. */
  enter(info: Pick<HoverInfo, "kind" | "nodeId">): void;
  /** A pinch opening over the canvas: enter whatever is under its centre, else the
   * current selection. */
  enterAt(clientX: number, clientY: number): void;
}

export function createMapNavigation(deps: {
  app: Application;
  getWorld(): WorldModel | null;
  getLevel(): MapLevel;
  /** Where the camera is HEADED. Every hit test converts through this rather than through the
   * live worldRoot transform: a level change moves `getLevel()` at once while the camera eases
   * in over CAMERA_SETTLE_MS, so during that flight the live transform belongs to neither
   * level and a pinch or wheel read through it landed in the wrong place (bug hunt
   * 2026-09-03). Reading the target makes a gesture mid-flight mean what it will look like it
   * meant once the camera lands. */
  getCameraTarget(): CameraFrame;
  /** Enters the given level and re-frames the camera (animated). */
  goToLevel(level: MapLevel): void;
  /** Opens a kingdom's subway map (a DOM overlay the controller never draws). */
  enterKingdom(nodeId: string): void;
  showHover(hover: HoverResult | null): void;
  /** What the controller currently shows as hovered/selected, so a move that stays on the
   * same place is free and a second tap on it can be told from a first. */
  currentHover(): HoverInfo | null;
  getInputMode(): InputMode;
}): MapNavigation {
  const { app } = deps;
  const pointer = { x: 0, y: 0 };
  let lastWheelAt = 0;

  function toWorldPoint(screenX: number, screenY: number): WorldPoint {
    const camera = deps.getCameraTarget();
    return {
      x: (screenX - camera.x) / camera.scale,
      y: (screenY - camera.y) / camera.scale,
    };
  }

  function underClient(clientX: number, clientY: number): HoverResult | null {
    const world = deps.getWorld();
    if (world === null) return null;
    const rect = app.canvas.getBoundingClientRect();
    const point = toWorldPoint(clientX - rect.left, clientY - rect.top);
    return resolveHover(world, deps.getLevel(), point);
  }

  function samePlace(a: HoverInfo | null, b: HoverInfo | null): boolean {
    return a === null || b === null ? a === b : a.kind === b.kind && a.nodeId === b.nodeId;
  }

  /** The island level is the deepest view, so a dive there simply has nowhere to go. */
  function dive(): void {
    const world = deps.getWorld();
    if (world === null || deps.getLevel().kind !== "world") return;
    const island = hitIsland(world, toWorldPoint(pointer.x, pointer.y));
    if (island === null) return;
    deps.goToLevel({ kind: "island", islandId: island.nodeId });
  }

  function back(): void {
    if (deps.getLevel().kind !== "island") return;
    deps.goToLevel({ kind: "world" });
  }

  function enter(info: Pick<HoverInfo, "kind" | "nodeId">): void {
    const level = deps.getLevel();
    if (info.kind === "island" && level.kind === "world") {
      deps.goToLevel({ kind: "island", islandId: info.nodeId });
    } else if (info.kind === "kingdom" && level.kind === "island") {
      deps.enterKingdom(info.nodeId);
    }
  }

  return {
    back,
    enter,
    /** A click anywhere on a place's region — with a mouse it enters at once (same hit test
     * as the wheel dive); with a finger it selects first and enters on the second tap. */
    onClick(event) {
      const hover = underClient(event.clientX, event.clientY);
      if (deps.getInputMode() === "fine") {
        if (hover !== null) enter(hover.info);
        return;
      }
      if (hover !== null && samePlace(hover.info, deps.currentHover())) {
        enter(hover.info);
        return;
      }
      deps.showHover(hover);
    },
    enterAt(clientX, clientY) {
      const hover = underClient(clientX, clientY);
      if (hover !== null) {
        enter(hover.info);
        return;
      }
      const current = deps.currentHover();
      if (current !== null) enter(current);
    },
    onWheel(event) {
      event.preventDefault();
      const now = performance.now();
      if (now - lastWheelAt < WHEEL_COOLDOWN_MS) return;
      lastWheelAt = now;
      if (event.deltaY > 0) back();
      else dive();
    },
    onPointerMove(event) {
      const world = deps.getWorld();
      if (world === null) return;
      const rect = app.canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      // A finger has no hover: moving it must not clear or retarget a tap's selection.
      if (deps.getInputMode() === "coarse") return;
      const hover = resolveHover(world, deps.getLevel(), toWorldPoint(pointer.x, pointer.y));
      if (!samePlace(hover?.info ?? null, deps.currentHover())) deps.showHover(hover);
    },
  };
}
