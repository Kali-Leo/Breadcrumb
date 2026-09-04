/**
 * Purpose: the map controller's teardown. A resize schedules a 200 ms debounce that rebuilds
 * the scene and re-frames the camera; leaving the map inside that window used to fire the
 * callback against a destroyed Pixi application (bug hunt 2026-09-03) — the controller's
 * destroy() unhooked the canvas listeners but never cleared the timer, and useMapApplication
 * destroys the Application immediately afterwards.
 *
 * Pixi is stubbed down to what createMapController touches before a world is ever set: a stage
 * to hold the world root, a screen size, a canvas that records its listeners, and a renderer
 * that hands back its "resize" handler.
 */

import type { Application } from "pixi.js";
import { Container } from "pixi.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapArt } from "./mapArtAssets";
import { createMapController } from "./mapController";

function stubApp() {
  const listeners = new Map<string, EventListener>();
  const rendererListeners = new Map<string, () => void>();
  const canvas = {
    addEventListener: vi.fn((type: string, handler: EventListener) => {
      listeners.set(type, handler);
    }),
    removeEventListener: vi.fn((type: string) => {
      listeners.delete(type);
    }),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  const renderer = {
    on: vi.fn((event: string, handler: () => void) => {
      rendererListeners.set(event, handler);
    }),
    off: vi.fn((event: string) => {
      rendererListeners.delete(event);
    }),
  };
  const app = {
    canvas,
    renderer,
    stage: new Container(),
    screen: { width: 800, height: 800 },
  } as unknown as Application;
  return { app, canvas, listeners, rendererListeners };
}

const art = { kingdomSeats: [], decor: {} } as unknown as MapArt;
const hooks = { onHover: vi.fn(), onLevel: vi.fn(), onEnterKingdom: vi.fn() };

describe("createMapController teardown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("clears the pending resize debounce, so nothing fires at a destroyed renderer", () => {
    const { app, rendererListeners } = stubApp();
    const controller = createMapController(app, art, hooks);
    const onResize = rendererListeners.get("resize");
    expect(onResize).toBeDefined();

    onResize?.();
    expect(vi.getTimerCount()).toBe(1);

    controller.destroy();

    expect(vi.getTimerCount()).toBe(0);
    // And nothing is left that a late resize could reach.
    expect(rendererListeners.has("resize")).toBe(false);
    vi.runAllTimers();
  });

  it("unhooks every canvas listener it installed", () => {
    const { app, listeners } = stubApp();
    expect(listeners.size).toBe(0);
    const controller = createMapController(app, art, hooks);
    expect([...listeners.keys()].sort()).toEqual(["click", "pointermove", "wheel"]);
    controller.destroy();
    expect(listeners.size).toBe(0);
  });
});
