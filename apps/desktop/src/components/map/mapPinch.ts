/**
 * Purpose: the two-finger grammar on the map canvas — a pinch OPEN enters the place under the
 * fingers' centre (or the current selection), a pinch CLOSE backs out one level. The map has
 * no free zoom: every level is an exact-fit frame (levels.ts), so the pinch is read as one
 * discrete verb per gesture, not as a scale factor. Recognition is @use-gesture/vanilla's
 * PinchGesture; this file only decides when the scale has moved far enough to mean it and
 * makes sure one gesture can fire at most once, with a short cooldown so two levels are never
 * skipped in one motion.
 * Main exports: bindMapPinch, MapPinchActions.
 */
import { PinchGesture } from "@use-gesture/vanilla";

/** Scale ratios that count as "meant it" — well past the jitter of two resting fingertips. */
const OPEN_RATIO = 1.25;
const CLOSE_RATIO = 0.8;
const COOLDOWN_MS = 300;

export interface MapPinchActions {
  /** Fingers spreading, centred at these client coordinates. */
  open(clientX: number, clientY: number): void;
  /** Fingers closing. */
  close(): void;
}

/** Binds the pinch to the canvas; returns the unbind. */
export function bindMapPinch(canvas: HTMLCanvasElement, actions: MapPinchActions): () => void {
  let firedThisGesture = false;
  let lastFiredAt = 0;
  const gesture = new PinchGesture(
    canvas,
    ({ offset, origin, first, last }) => {
      if (first) firedThisGesture = false;
      if (last || firedThisGesture) return;
      const now = performance.now();
      if (now - lastFiredAt < COOLDOWN_MS) return;
      const scale = offset[0];
      if (scale >= OPEN_RATIO) actions.open(origin[0], origin[1]);
      else if (scale <= CLOSE_RATIO) actions.close();
      else return;
      firedThisGesture = true;
      lastFiredAt = now;
    },
    {
      // Touch events where the browser has them (iPadOS Safari); pointer events elsewhere.
      pointer: { touch: true },
      // Each gesture starts from a scale of 1 — the map keeps no zoom between gestures.
      from: () => [1, 0],
      eventOptions: { passive: false },
    },
  );
  return () => gesture.destroy();
}
