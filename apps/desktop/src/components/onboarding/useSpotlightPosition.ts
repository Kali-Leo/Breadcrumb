/**
 * Purpose: keeps the spotlight hole on its target — re-measures when the step changes, when
 * the window resizes, when anything on the page scrolls, and when the visual viewport moves.
 * The target may not exist the instant a view is switched to (the map mounts a Pixi canvas
 * and generates terrain first), so it polls rather than guessing one delay: a single timeout
 * is either too short on a slow machine or a needless wait on a fast one.
 *
 * Window resize alone is not enough on a tablet. A soft keyboard opening, or the browser's
 * own bars sliding away, moves the visual viewport without touching the layout viewport, and
 * a target that lives inside a scrolling panel moves whenever that panel scrolls — in both
 * cases the ring would stay behind, framing empty space.
 * Main exports: useSpotlightPosition.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { measureSpotlight, type SpotlightRect } from "./spotlightPlacement";

const POLL_MS = 120;
const POLL_LIMIT = 24;

export function useSpotlightPosition(target: string | undefined): SpotlightRect | null {
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const settleTimer = useRef<number | null>(null);

  const remeasure = useCallback(() => setRect(measureSpotlight(target)), [target]);

  useLayoutEffect(() => {
    setRect(null);
    let attempts = 0;
    const tick = () => {
      const found = measureSpotlight(target);
      setRect(found);
      attempts += 1;
      // Stop as soon as it is there. Giving up leaves the card centred and the step still
      // readable — a view that never rendered (no WebGL for the map, say) must not take the
      // tour down with it.
      if (found === null && attempts < POLL_LIMIT) {
        settleTimer.current = window.setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    };
  }, [target]);

  useEffect(() => {
    // Scroll in the capture phase: it does not bubble, so a panel scrolling somewhere in the
    // tree is only heard on the way down.
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    const viewport = globalThis.visualViewport;
    viewport?.addEventListener("resize", remeasure);
    viewport?.addEventListener("scroll", remeasure);
    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
      viewport?.removeEventListener("resize", remeasure);
      viewport?.removeEventListener("scroll", remeasure);
    };
  }, [remeasure]);

  return rect;
}
