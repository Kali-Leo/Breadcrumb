/**
 * Purpose: the map controller's event wiring — the canvas's pointer/wheel/click listeners, the
 * debounced renderer resize, and the single teardown that takes all of it back off again.
 * Split out of mapController so binding and unbinding sit in one another's sight: they used to
 * be a hundred lines apart and had drifted, leaving the resize debounce running past destroy()
 * to rebuild the scene of an Application that useMapApplication had already torn down (bug hunt
 * 2026-09-03). Owns no Pixi objects and no map state.
 * Main exports: bindMapEvents, MapResizeHandlers.
 */
import type { Application } from "pixi.js";
import type { MapNavigation } from "./mapNavigation";

/** Long enough that a drag-resize re-places names once, not on every animation frame. */
const RESIZE_DEBOUNCE_MS = 200;

export interface MapResizeHandlers {
  /** Re-frame the camera at once, so the map never sits mis-centred while a drag is in flight. */
  reframe(): void;
  /** Re-place labels once the size has stopped changing — stale positions are how names end up
   * lying on each other. */
  replace(): void;
}

/** Binds everything the controller listens to; returns the unbind, which is total. */
export function bindMapEvents(
  app: Application,
  navigation: MapNavigation,
  resize: MapResizeHandlers,
): () => void {
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

  function onResize(): void {
    resize.reframe();
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      resize.replace();
    }, RESIZE_DEBOUNCE_MS);
  }

  app.canvas.addEventListener("wheel", navigation.onWheel, { passive: false });
  app.canvas.addEventListener("click", navigation.onClick);
  app.canvas.addEventListener("pointermove", navigation.onPointerMove);
  app.renderer.on("resize", onResize);

  return () => {
    app.canvas.removeEventListener("wheel", navigation.onWheel);
    app.canvas.removeEventListener("click", navigation.onClick);
    app.canvas.removeEventListener("pointermove", navigation.onPointerMove);
    app.renderer.off("resize", onResize);
    // The debounce outlives this call by up to RESIZE_DEBOUNCE_MS, and the Application is
    // destroyed the moment the caller returns — a pending replace would land on a dead
    // renderer.
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = null;
  };
}
