/**
 * Purpose: drag-to-pan on a scrolling container — pointer capture only once the gesture is
 * definitely a pan, so plain clicks keep their normal click flow, and a suppression flag so
 * the click ending a pan does not activate whatever sat under the cursor.
 *
 * A finger needs none of it, and is actively hurt by it: the container already scrolls
 * itself, with momentum, and writing scrollLeft/scrollTop from a pointermove handler at the
 * same time makes the two fight. Worse, a fingertip wobbles well past the five pixels that
 * tell a mouse "this is a pan", so every tap on a node was being swallowed as the end of a
 * drag. So `enabled` switches the whole mechanism off for touch and the browser drives.
 * Main exports: useDragPan, DragPan.
 */
import { type PointerEvent as ReactPointerEvent, type RefObject, useRef } from "react";

/** Pointer travel below this is a click on whatever is under the cursor, not a pan. */
const DRAG_THRESHOLD_PX = 5;

interface DragState {
  x: number;
  y: number;
  left: number;
  top: number;
  moved: boolean;
}

export interface DragPan {
  containerRef: RefObject<HTMLDivElement | null>;
  /** True while a pan is in flight — the cursor reads it during render. */
  dragRef: RefObject<DragState | null>;
  /** True for the click that ends a pan; the node handler bails out on it. */
  suppressClickRef: RefObject<boolean>;
  handlers: {
    onPointerDown(event: ReactPointerEvent): void;
    onPointerMove(event: ReactPointerEvent): void;
    onPointerUp(event: ReactPointerEvent): void;
    onPointerCancel(event: ReactPointerEvent): void;
    onPointerLeave(): void;
  };
}

/** releasePointerCapture throws when the pointer is already gone, which is exactly the case
 * pointercancel reports. Ask first. */
function releaseCapture(container: HTMLElement | null | undefined, pointerId: number): void {
  if (container?.hasPointerCapture(pointerId) === true) container.releasePointerCapture(pointerId);
}

/** @param enabled false on a touch screen, where the container's own scrolling is better
 * than anything this can do. */
export function useDragPan(enabled: boolean): DragPan {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  return {
    containerRef,
    dragRef,
    suppressClickRef,
    handlers: {
      onPointerDown(event) {
        const container = containerRef.current;
        if (!enabled || container === null) return;
        dragRef.current = {
          x: event.clientX,
          y: event.clientY,
          left: container.scrollLeft,
          top: container.scrollTop,
          moved: false,
        };
      },
      onPointerMove(event) {
        const drag = dragRef.current;
        const container = containerRef.current;
        if (!enabled || drag === null || container === null) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        if (!drag.moved) {
          // Capture only once the gesture is definitely a pan (plain clicks keep their
          // normal click flow) so native selection-drag can't steal the move stream.
          container.setPointerCapture(event.pointerId);
        }
        drag.moved = true;
        document.getSelection()?.removeAllRanges();
        container.scrollLeft = drag.left - dx;
        container.scrollTop = drag.top - dy;
      },
      onPointerUp(event) {
        releaseCapture(containerRef.current, event.pointerId);
        suppressClickRef.current = dragRef.current?.moved ?? false;
        dragRef.current = null;
        // Let the click event (which fires right after pointerup) see the flag, then clear.
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      },
      onPointerCancel(event) {
        // The browser has taken the gesture over (a native scroll, a system gesture). No
        // click follows a cancelled pointer, so nothing is suppressed — but the capture and
        // the half-finished drag must go, or the next gesture starts on stale state.
        releaseCapture(containerRef.current, event.pointerId);
        dragRef.current = null;
        suppressClickRef.current = false;
      },
      onPointerLeave() {
        dragRef.current = null;
      },
    },
  };
}
