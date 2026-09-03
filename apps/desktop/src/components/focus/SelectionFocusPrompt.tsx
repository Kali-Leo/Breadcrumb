/**
 * Purpose: what a live text selection offers, drawn once for both selection sites (the chat
 * bubble and the focus overlay's pane). With a mouse it is the hint line it has always been,
 * pixel for pixel, and Enter confirms. With a finger there is no Enter key, so it is a real
 * button, 44px tall, placed BELOW the selection — iOS puts its own copy/look-up bar above,
 * and the two would otherwise sit on top of each other. Placement is @floating-ui/dom's job
 * (flip when the bottom of the screen is close, shift to stay inside it) against a virtual
 * reference element made of the selection's own rectangle.
 * Main exports: SelectionFocusPrompt.
 */
import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SelectionCapture } from "../../lib/focus/selectionFocus";
import { useInputMode } from "../../lib/platform/inputMode";

/** Clear of the selection's own highlight, and of the fat finger that made it. */
const BUTTON_GAP_PX = 8;
/** The button never touches the edge of the screen. */
const VIEWPORT_PADDING_PX = 8;

export function SelectionFocusPrompt({
  selection,
  hint,
  onConfirm,
}: {
  selection: SelectionCapture | null;
  /** The mouse-mode line, already worded and truncated by the caller. */
  hint: ReactNode;
  onConfirm: () => void;
}) {
  const { t } = useTranslation(["learning", "common"]);
  const inputMode = useInputMode();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    setPlacement(null);
    const floating = buttonRef.current;
    if (selection === null || inputMode !== "coarse" || floating === null) return;
    let cancelled = false;
    const rect = selection.rect;
    void computePosition({ getBoundingClientRect: () => rect }, floating, {
      strategy: "fixed",
      placement: "bottom",
      middleware: [offset(BUTTON_GAP_PX), flip(), shift({ padding: VIEWPORT_PADDING_PX })],
    }).then(({ x, y }) => {
      if (!cancelled) setPlacement({ left: x, top: y });
    });
    return () => {
      cancelled = true;
    };
  }, [selection, inputMode]);

  if (selection === null) return null;

  if (inputMode === "coarse") {
    return (
      <button
        type="button"
        ref={buttonRef}
        data-selection-prompt
        onClick={onConfirm}
        style={{
          position: "fixed",
          left: placement?.left ?? 0,
          top: placement?.top ?? 0,
          // Measured before it is placed: shown only once floating-ui has answered.
          visibility: placement === null ? "hidden" : "visible",
        }}
        className="z-30 flex min-h-11 min-w-11 items-center rounded-xl border border-stone-200 bg-white px-4 font-medium text-sm text-stone-700 shadow-lg"
      >
        {t("learning:focus.selectionButton")}
      </button>
    );
  }

  return (
    <div
      style={{ position: "fixed", left: selection.rect.left, top: selection.rect.top - 32 }}
      className="z-20 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600 shadow-lg"
    >
      {hint}
    </div>
  );
}
