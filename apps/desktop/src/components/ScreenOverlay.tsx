/**
 * Purpose: a layer that covers the window, not the page it was opened from. It renders into the
 * body instead of into whatever scrolled container the trigger sat in — an absolutely positioned
 * layer inside a scrolled feed lands at the top of that feed, which is the bug this exists to make
 * unrepeatable (Leo's report 2026-08-18). Carries the dialog role, the accessible name, focus and
 * Escape; the caller fills in the layer itself.
 * Main exports: ScreenOverlay.
 */
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { openScreenOverlayLayer } from "../lib/screenOverlayLayer";

interface ScreenOverlayProps {
  /** What a screen reader announces on open — the item's title, or the list's name. */
  label: string;
  onClose(): void;
  children: ReactNode;
}

export function ScreenOverlay({ label, onClose, children }: ScreenOverlayProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  // Read at the moment Escape lands, so a caller passing a fresh closure each render does not
  // reopen the layer (which would re-run the focus move and the withdrawal underneath it).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (layer === null) return;
    return openScreenOverlayLayer({ element: layer, onRequestClose: () => onCloseRef.current() });
  }, []);

  return createPortal(
    <div
      ref={layerRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col overscroll-contain bg-stone-50 outline-none"
    >
      {children}
    </div>,
    document.body,
  );
}
