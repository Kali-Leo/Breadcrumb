/**
 * Purpose: the 🪞 feedback lab's "重逢邀请" section — the lowest-retention known concepts,
 * framed as a minimal restart (Marlatt); clicking starts a fresh chat and jumps into it.
 * Main exports: FeedbackReunionSection.
 */
import { FEEDBACK_COPY } from "@breadcrumb/plugin-feedback";
import { useState } from "react";
import { useFeedbackStore } from "../stores/feedbackStore";

export function FeedbackReunionSection() {
  const reunion = useFeedbackStore((state) => state.reunion);
  const [openingNodeId, setOpeningNodeId] = useState<string | null>(null);

  async function open(nodeId: string, title: string) {
    setOpeningNodeId(nodeId);
    try {
      await useFeedbackStore.getState().openReunion(title);
    } finally {
      setOpeningNodeId(null);
    }
  }

  return (
    <section className="rounded-xl bg-white p-3 shadow-sm">
      <h3 className="font-semibold text-stone-600">{FEEDBACK_COPY.reunionTitle}</h3>
      {reunion.waitingCount === 0 ? (
        <p className="mt-1 text-stone-400">{FEEDBACK_COPY.reunionEmpty}</p>
      ) : (
        <>
          <p className="mt-1 text-stone-500">{FEEDBACK_COPY.reunionIntro}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {reunion.invites.map((invite) => (
              <li key={invite.nodeId}>
                <button
                  type="button"
                  disabled={openingNodeId !== null}
                  onClick={() => void open(invite.nodeId, invite.title)}
                  className="rounded border border-stone-200 px-3 py-1.5 text-left text-stone-700 transition-colors hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50"
                >
                  <span className="block font-medium">{invite.title}</span>
                  <span className="text-[10px] text-amber-600">
                    {openingNodeId === invite.nodeId
                      ? FEEDBACK_COPY.loading
                      : FEEDBACK_COPY.reunionInviteAction}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
