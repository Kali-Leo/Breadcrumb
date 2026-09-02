/**
 * Purpose: the kingdom tree's scrolling pane — tracks its rendered content-box size (the
 * fit calculation needs real pixels) and, once per mount, opens centered on the primary
 * recommendation, or on the tree's middle when there is none (Leo 2026-08-31 #2).
 * Main exports: useKingdomTreePane.
 */
import { type RefObject, useEffect, useRef, useState } from "react";

export interface KingdomTreePane {
  paneRef: RefObject<HTMLDivElement | null>;
  size: { width: number; height: number };
}

export function useKingdomTreePane(primaryId: string | null): KingdomTreePane {
  const paneRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = paneRef.current;
    if (element === null) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const centeredRef = useRef(false);
  useEffect(() => {
    if (centeredRef.current) return;
    const pane = paneRef.current;
    if (pane === null || pane.clientWidth === 0) return;
    centeredRef.current = true;
    const primary =
      primaryId === null ? null : pane.querySelector(`[data-station-id="${primaryId}"]`);
    if (primary !== null) {
      primary.scrollIntoView({ block: "center", inline: "center" });
      return;
    }
    pane.scrollLeft = (pane.scrollWidth - pane.clientWidth) / 2;
    pane.scrollTop = (pane.scrollHeight - pane.clientHeight) / 2;
  });

  return { paneRef, size };
}
