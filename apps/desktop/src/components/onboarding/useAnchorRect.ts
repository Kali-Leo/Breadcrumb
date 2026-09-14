/**
 * Purpose: keeps a bubble on its element — re-measures when the window resizes, when
 * anything on the page scrolls, when the visual viewport moves, and when the element itself
 * changes size. Null once the element has left the document, which is the bubble's cue to go
 * without a fade: the thing it was about is no longer there.
 *
 * Window resize alone is not enough on a tablet. A soft keyboard opening, or the browser's
 * own bars sliding away, moves the visual viewport without touching the layout viewport, and
 * an element that lives inside a scrolling panel moves whenever that panel scrolls — in both
 * cases the arrow would stay behind, pointing at empty space.
 * Main exports: useAnchorRect.
 */
import { useCallback, useEffect, useState } from "react";
import { type AnchorRect, measureAnchor } from "./hintPlacement";

export function useAnchorRect(element: Element): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(() => measureAnchor(element));
  const remeasure = useCallback(() => setRect(measureAnchor(element)), [element]);

  useEffect(() => {
    remeasure();
    // Scroll in the capture phase: it does not bubble, so a panel scrolling somewhere in the
    // tree is only heard on the way down.
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    const viewport = globalThis.visualViewport;
    viewport?.addEventListener("resize", remeasure);
    viewport?.addEventListener("scroll", remeasure);
    const observer = new ResizeObserver(remeasure);
    observer.observe(element);
    // Removal from the document fires no event of its own, so it is polled — cheaply, and
    // only while a bubble is up.
    const watch = window.setInterval(() => {
      if (!element.isConnected) setRect(null);
    }, 250);
    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
      viewport?.removeEventListener("resize", remeasure);
      viewport?.removeEventListener("scroll", remeasure);
      observer.disconnect();
      window.clearInterval(watch);
    };
  }, [element, remeasure]);

  return rect;
}
