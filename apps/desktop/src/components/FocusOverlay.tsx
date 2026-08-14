/**
 * Purpose: the full-screen focus (explain-word) overlay (spec 042 §3) — header (back-to-parent,
 * root word, exit), the current station's content pane, and the session's own-sized subway map
 * pane (spec 042 §4). Renders nothing when no session is open; mounted once at the app shell's
 * top level.
 * Main exports: FocusOverlay.
 */
import { EXPLORE_UI_COPY } from "@breadcrumb/plugin-explore";
import { useFocusStore } from "../stores/focusStore";
import { FocusContentPane } from "./FocusContentPane";
import { FocusMap } from "./FocusMap";

export function FocusOverlay() {
  const open = useFocusStore((state) => state.open);
  const rootLabel = useFocusStore((state) => state.rootLabel);
  const nodes = useFocusStore((state) => state.nodes);
  const currentNodeId = useFocusStore((state) => state.currentNodeId);
  const jumpTo = useFocusStore((state) => state.jumpTo);
  const exitFocus = useFocusStore((state) => state.exitFocus);

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
              className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100"
            >
              {EXPLORE_UI_COPY.focusUpButton}
            </button>
          )}
          <span className="font-semibold text-stone-800">{rootLabel}</span>
        </div>
        <button
          type="button"
          onClick={exitFocus}
          className="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
        >
          {EXPLORE_UI_COPY.focusExitButton}
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <FocusContentPane currentNode={currentNode} />
        <FocusMap />
      </div>
    </div>
  );
}
