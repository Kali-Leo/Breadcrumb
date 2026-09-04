/**
 * Purpose: what a live text selection offers, drawn once for both selection sites (the chat
 * bubble and the focus overlay's pane). With a mouse it is the hint line it has always been,
 * pixel for pixel, and Enter confirms.
 *
 * With a finger there is no Enter key, so it is a real button, 44px tall — and it does NOT
 * follow the selection. iOS draws its own copy/look-up bar hugging the selection, above it or
 * below it depending on the room left, so anything placed near the selection is covered about
 * half the time (Leo's iPad, 2026-09-03; placing it below was not enough). It sits instead in
 * a bar at the foot of the reading area, above whatever input the surface has, where the
 * system bar never reaches. The surface publishes that input's height as --composer-height.
 * Main exports: SelectionFocusPrompt.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { SelectionCapture } from "../../lib/focus/selectionFocus";
import { useInputMode } from "../../lib/platform/inputMode";

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

  if (selection === null) return null;

  if (inputMode === "coarse") {
    return (
      <div
        data-selection-prompt
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--composer-height,0px)+0.75rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-3"
      >
        <button
          type="button"
          onClick={onConfirm}
          className="pointer-events-auto flex min-h-11 min-w-11 items-center rounded-full border border-stone-200 bg-white px-5 font-medium text-sm text-stone-700 shadow-lg"
        >
          {t("learning:focus.selectionButton")}
        </button>
      </div>
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
