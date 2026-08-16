/**
 * Purpose: the palace context stack's "从这里继续" card (spec 047) — the frontier's top
 * candidates as clickable suggestions, each opening a context-seeded chat (zero LLM).
 * Scores and evidence-weight internals drive the ordering but are never displayed; copy is
 * suggest-only. An optional node-id filter scopes the card to the dived island's members.
 * Main exports: ContinueCard.
 */
import { useState } from "react";
import { startLearningForConcept } from "../../lib/focusLearning";
import { appEventBus, useChatStore } from "../../stores/chatStore";
import { usePlannerStore } from "../../stores/plannerStore";
import { useSettingsStore } from "../../stores/settingsStore";

const SHOWN_LIMIT = 3;

interface ContinueCardProps {
  /** When set, only candidates inside this set are shown (island-level scoping). */
  filterNodeIds?: ReadonlySet<string>;
}

export function ContinueCard({ filterNodeIds }: ContinueCardProps) {
  const candidates = usePlannerStore((state) => state.frontierCandidates);
  const [openingNodeId, setOpeningNodeId] = useState<string | null>(null);

  const shown = (
    filterNodeIds === undefined
      ? candidates
      : candidates.filter((candidate) => filterNodeIds.has(candidate.nodeId))
  ).slice(0, SHOWN_LIMIT);
  if (shown.length === 0) return null;

  async function open(nodeId: string, label: string, litLabels: readonly string[]) {
    setOpeningNodeId(nodeId);
    try {
      // Straight into focus mode — the AI starts explaining right away (spec 050 §2).
      const result = await startLearningForConcept(
        label,
        litLabels,
        useSettingsStore.getState().featureSwitches.focusExplain,
      );
      if (result.mode === "chat") {
        await useChatStore.getState().loadFromDatabase();
        appEventBus.emit("app:navigateChat", { conversationId: result.conversationId });
      }
    } finally {
      setOpeningNodeId(null);
    }
  }

  return (
    <section className="rounded-xl bg-white p-3 text-xs shadow-sm">
      <h3 className="font-semibold text-stone-600">从这里继续</h3>
      <ul className="mt-1 space-y-1">
        {shown.map((candidate) => (
          <li key={candidate.nodeId}>
            <button
              type="button"
              disabled={openingNodeId !== null}
              onClick={() =>
                void open(candidate.nodeId, candidate.label, candidate.reason.litPrerequisiteLabels)
              }
              className="w-full rounded border border-stone-200 px-2 py-1.5 text-left transition-colors hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50"
            >
              <span className="flex items-center gap-1 font-medium text-stone-700">
                {candidate.label}
                {candidate.reason.wasLitBefore && (
                  <span className="rounded bg-stone-100 px-1 text-[10px] text-stone-500">
                    重逢 · 以前学过
                  </span>
                )}
                {candidate.reason.inGoalGap && (
                  <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700">
                    在目标路上
                  </span>
                )}
              </span>
              {candidate.reason.litPrerequisiteLabels.length > 0 && (
                <span className="mt-0.5 block text-stone-400">
                  因为你已掌握 {candidate.reason.litPrerequisiteLabels.join("、")}
                </span>
              )}
              {candidate.reason.gatewayTo && (
                <span className="mt-0.5 block text-stone-400">
                  通往你感兴趣的「{candidate.reason.gatewayTo.label}」
                </span>
              )}
              <span className="mt-0.5 block text-[10px] text-amber-600">
                {openingNodeId === candidate.nodeId ? "打开中…" : "去聊聊"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
