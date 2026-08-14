/**
 * Purpose: the full-screen focus (explain-word) overlay (spec 042 §3) — header (root word +
 * exit), the current station's content pane, and the session's subway map. Renders nothing
 * when no session is open; mounted once at the app shell's top level.
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
  const exitFocus = useFocusStore((state) => state.exitFocus);

  if (!open) return null;

  const currentNode = nodes.find((node) => node.id === currentNodeId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between border-stone-200 border-b px-6 py-3">
        <span className="font-semibold text-stone-800">{rootLabel}</span>
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
        <aside className="w-64 shrink-0 overflow-y-auto border-stone-200 border-l p-3">
          <FocusMap />
        </aside>
      </div>
    </div>
  );
}
