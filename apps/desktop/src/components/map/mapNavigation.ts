/**
 * Purpose: the map canvas's pointer input — screen→world conversion, the click and wheel
 * dive into an island (the island level is the deepest view, so a dive there simply has
 * nowhere to go), the wheel's way back out, and the hover readout's pointer tracking. Owns
 * no Pixi objects and no level state: it reads the controller's world/level and asks it to
 * navigate.
 * Main exports: MapNavigation, createMapNavigation.
 *
 * Directory note: the non-component .ts files in components/map/ are the Pixi rendering
 * layer and belong to the view layer; logic with no DOM or Pixi lives in lib/.
 */
import type { WorldModel, WorldPoint } from "@breadcrumb/feature-map";
import type { Application, Container } from "pixi.js";
import { hitIsland, type MapLevel } from "./levels";
import { type HoverResult, resolveHover } from "./mapHover";

const WHEEL_COOLDOWN_MS = 380;

export interface MapNavigation {
  onWheel(event: WheelEvent): void;
  onClick(event: MouseEvent): void;
  onPointerMove(event: PointerEvent): void;
}

export function createMapNavigation(deps: {
  app: Application;
  worldRoot: Container;
  getWorld(): WorldModel | null;
  getLevel(): MapLevel;
  /** Enters the given level and re-frames the camera (animated). */
  goToLevel(level: MapLevel): void;
  showHover(hover: HoverResult | null): void;
  /** The controller's own hover identity, so a move that stays on the same place is free. */
  currentHoverId(): string | null;
}): MapNavigation {
  const { app, worldRoot } = deps;
  const pointer = { x: 0, y: 0 };
  let lastWheelAt = 0;

  function toWorldPoint(screenX: number, screenY: number): WorldPoint {
    return {
      x: (screenX - worldRoot.position.x) / worldRoot.scale.x,
      y: (screenY - worldRoot.position.y) / worldRoot.scale.x,
    };
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

  return {
    /** A click anywhere on an island's region navigates — same hit test as the wheel dive. */
    onClick(event) {
      const world = deps.getWorld();
      if (world === null || deps.getLevel().kind !== "world") return;
      const rect = app.canvas.getBoundingClientRect();
      const point = toWorldPoint(event.clientX - rect.left, event.clientY - rect.top);
      const island = hitIsland(world, point);
      if (island === null) return;
      deps.goToLevel({ kind: "island", islandId: island.nodeId });
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
      const hover = resolveHover(world, deps.getLevel(), toWorldPoint(pointer.x, pointer.y));
      const hoverId = hover === null ? null : `${hover.info.kind}:${hover.info.nodeId}`;
      if (hoverId !== deps.currentHoverId()) deps.showHover(hover);
    },
  };
}
