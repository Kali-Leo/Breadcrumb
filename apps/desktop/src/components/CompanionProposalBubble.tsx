/**
 * Purpose: the companion's teach-back invitation as a line in her own chat (Leo 2026-08-15,
 * replacing the sidebar popup card) — an assistant-styled bubble with the 现在讲/改天 actions,
 * shown at the end of the matching companion conversation while the proposal is pending.
 * Rendering it marks the proposal seen, which clears the sidebar's unread dot.
 * Main exports: CompanionProposalBubble.
 */
import { COMPANION_COPY } from "@breadcrumb/plugin-companion";
import { useEffect } from "react";
import { useChatStore } from "../stores/chatStore";
import { useCompanionStore } from "../stores/companionStore";

export function CompanionProposalBubble() {
  const activeKind = useChatStore((state) => state.activeKind);
  const activeCompanionId = useChatStore((state) => state.activeCompanionId);
  const activeProposal = useCompanionStore((state) => state.activeProposal);
  const declineEcho = useCompanionStore((state) => state.declineEcho);
  const acceptProposal = useCompanionStore((state) => state.acceptProposal);
  const declineProposal = useCompanionStore((state) => state.declineProposal);
  const markProposalSeen = useCompanionStore((state) => state.markProposalSeen);

  const inCompanionChat = activeKind === "companion" && activeCompanionId !== null;
  const visible =
    inCompanionChat && activeProposal !== null && activeProposal.companion_id === activeCompanionId;

  useEffect(() => {
    if (visible) markProposalSeen();
  }, [visible, markProposalSeen]);

  // The learner's own decline line lingers a moment where the invitation was.
  if (inCompanionChat && !visible && declineEcho !== null) {
    return <p className="px-1 text-stone-400 text-xs">{declineEcho}</p>;
  }
  if (!visible || activeProposal === null) return null;

  return (
    <div className="flex justify-start">
      <div className="max-w-[76%] space-y-1.5">
        <div className="rounded-2xl bg-white px-4 py-2.5 text-[15px] leading-relaxed text-stone-800 shadow-sm">
          {COMPANION_COPY.proposalPreview(activeProposal.topic)}
        </div>
        <div className="flex gap-2 px-1">
          <button
            type="button"
            onClick={() => void acceptProposal()}
            className="rounded bg-amber-100 px-2 py-0.5 text-stone-700 text-xs hover:bg-amber-200"
          >
            {COMPANION_COPY.accept}
          </button>
          <button
            type="button"
            onClick={() => void declineProposal()}
            className="rounded px-2 py-0.5 text-stone-500 text-xs hover:bg-stone-100"
          >
            {COMPANION_COPY.decline}
          </button>
        </div>
      </div>
    </div>
  );
}
