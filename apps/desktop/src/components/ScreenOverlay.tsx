/**
 * Purpose: a reading layer that covers the window, not the page it was opened from. It is a native
 * `<dialog>` opened with `showModal()`, which puts it in the browser's top layer — out of reach of
 * every ancestor's overflow, transform and z-index, the failure class behind Leo's report of
 * 2026-08-18 (a layer inside the scrolled feed landed at the top of the feed). The browser, not
 * this file, provides Escape, the page underneath going inert, and focus returning to whatever
 * opened the layer. Sized to leave the feed showing around it, so the layer reads as a card over
 * the list rather than a new page (spec 054 §a).
 * Main exports: ScreenOverlay, screenOverlayAutofocusRef.
 */
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ScreenOverlayProps {
  /** What a screen reader announces on open — the item's title, or the list's name. */
  label: string;
  onClose(): void;
  children: ReactNode;
}

/**
 * Put on the layer's close button. `showModal()` focuses the element carrying the `autofocus`
 * attribute and falls back to the first focusable one, and React renders `autoFocus` as a focus()
 * call rather than as the attribute — a call `showModal()` then overrides. So the attribute is
 * written onto the node itself.
 */
export function screenOverlayAutofocusRef(node: HTMLElement | null): void {
  node?.setAttribute("autofocus", "");
}

// 24px of window showing around the layer from 960px up, 32px from 1424px up (小红书's measured
// values, spec 054 §a); below 960px there is no room to give away and the layer fills the window.
const LAYER_CLASS_NAME = [
  "fixed inset-0 m-0 h-full w-full max-h-none max-w-none",
  "min-[960px]:inset-6 min-[960px]:h-auto min-[960px]:w-auto",
  "min-[1424px]:inset-8",
  // Scrolling stops at the layer's edge instead of running on into the feed behind it. The other
  // way of stopping it, locking the body's overflow, takes the scrollbar away and shifts the page
  // underneath (Reddit's write-up of their own dialog, spec 054 §a).
  "overflow-hidden overscroll-contain",
  // display:flex only while open, so the frame before showModal() runs does not paint the layer.
  "hidden open:flex flex-col",
  "border-0 bg-stone-50 p-0 outline-none",
  "min-[960px]:rounded-[20px] min-[960px]:shadow-2xl",
  // The dimmed window is what says the feed is still there, underneath.
  "backdrop:bg-stone-900/40",
].join(" ");

export function ScreenOverlay({ label, onClose, children }: ScreenOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Read at the moment the dialog closes, so a caller passing a fresh closure each render does not
  // reopen the layer — a second showModal() would move focus again and re-stack the layer.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closingBecauseUnmounted = useRef(false);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    dialog.showModal();
    return () => {
      closingBecauseUnmounted.current = true;
      dialog.close();
    };
  }, []);

  return createPortal(
    // No tabindex: MDN warns against it on a dialog, and no role or aria-modal either — the
    // element already carries both.
    <dialog
      ref={dialogRef}
      aria-label={label}
      // One way out for every way of closing: Escape (the browser's) and close() both land here.
      onClose={() => {
        if (!closingBecauseUnmounted.current) onCloseRef.current();
      }}
      className={LAYER_CLASS_NAME}
    >
      {children}
    </dialog>,
    document.body,
  );
}
