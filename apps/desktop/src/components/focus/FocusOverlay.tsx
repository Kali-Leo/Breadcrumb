/**
 * Purpose: the full-screen focus (explain-word) overlay (spec 042 §3) — header (back-to-parent,
 * root word, exit; Escape exits too unless a lower layer claimed the key), the current station's
 * content pane, and the session's own-sized subway map pane (spec 042 §4). Side by side when
 * there is room; on a narrow or upright screen the map moves to the top and the content sits
 * under it. Renders nothing when no session is open; mounted once at the app shell's top level.
 * Main exports: FocusOverlay.
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFocusStore } from "../../stores/focusStore";
import { BackArrow } from "../DirectionalArrow";
import { FocusContentPane } from "./FocusContentPane";
import { FocusMap } from "./FocusMap";

export function FocusOverlay() {
  const { t } = useTranslation(["learning", "common"]);
  const open = useFocusStore((state) => state.open);
  const rootLabel = useFocusStore((state) => state.rootLabel);
  const nodes = useFocusStore((state) => state.nodes);
  const currentNodeId = useFocusStore((state) => state.currentNodeId);
  const jumpTo = useFocusStore((state) => state.jumpTo);
  const exitFocus = useFocusStore((state) => state.exitFocus);

  // Escape closes the overlay — unless a layer below (the selection hint) already claimed
  // the key via preventDefault. Child effects register their listeners first, so their
  // claim is visible by the time this handler runs.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      useFocusStore.getState().exitFocus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  const currentNode = nodes.find((node) => node.id === currentNodeId) ?? null;
  const parentId = currentNode?.parent_id ?? null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between border-stone-200 border-b px-6 py-3">
        <div className="flex items-center gap-3">
          {parentId !== null && (
            <button
              type="button"
              onClick={() => jumpTo(parentId)}
              className="rounded-lg px-2 py-1 text-sm text-stone-500 coarse:inline-flex coarse:min-h-11 coarse:min-w-11 coarse:items-center coarse:px-3 hover:bg-stone-100"
            >
              <BackArrow /> {t("learning:focus.upButton")}
            </button>
          )}
          <span className="font-semibold text-stone-800">{rootLabel}</span>
        </div>
        <button
          type="button"
          onClick={exitFocus}
          className="rounded-lg px-3 py-1.5 text-sm text-stone-600 coarse:inline-flex coarse:min-h-11 coarse:min-w-11 coarse:items-center coarse:justify-center coarse:px-4 hover:bg-stone-100"
        >
          {t("learning:focus.exitButton")}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 stacked:flex-col">
        <FocusContentPane currentNode={currentNode} />
        <FocusMap />
      </div>
    </div>
  );
}
