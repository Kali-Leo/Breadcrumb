/**
 * Purpose: sidebar "伙伴" section (spec 037) — three companion cards to open/continue a chat,
 * plus any pending proactive teach-back proposal card. Hidden entirely when the companion chat
 * switch is off (product principle 3 — every metered environment is fully removable).
 * Main exports: CompanionSection.
 */
import { COMPANION_COPY } from "@breadcrumb/plugin-companion";
import {
  COMPANION_DESKTOP_COPY,
  getCompanionCardById,
  openCompanionConversation,
} from "../lib/companionActions";
import { useChatStore } from "../stores/chatStore";
import { useCompanionStore } from "../stores/companionStore";
import { useSettingsStore } from "../stores/settingsStore";

interface CompanionSectionProps {
  onOpenChat(): void;
}

export function CompanionSection({ onOpenChat }: CompanionSectionProps) {
  const companionChatEnabled = useSettingsStore((state) => state.featureSwitches.companionChat);
  const cards = useCompanionStore((state) => state.cards);
  const activeProposal = useCompanionStore((state) => state.activeProposal);
  const declineEcho = useCompanionStore((state) => state.declineEcho);
  const acceptProposal = useCompanionStore((state) => state.acceptProposal);
  const declineProposal = useCompanionStore((state) => state.declineProposal);
  const openConversation = useChatStore((state) => state.openConversation);

  if (!companionChatEnabled) return null;

  const open = async (companionId: string) => {
    const conversationId = await openCompanionConversation(companionId);
    await openConversation(conversationId);
    onOpenChat();
  };

  const proposalCompanionName =
    activeProposal !== null
      ? (getCompanionCardById(activeProposal.companion_id)?.data.name ??
        activeProposal.companion_id)
      : "";

  return (
    <section className="mx-3 mb-2">
      <h3 className="mb-1 font-semibold text-stone-600">{COMPANION_COPY.sectionTitle}</h3>
      <p className="mb-2 text-stone-400 text-xs">{COMPANION_DESKTOP_COPY.sectionHint}</p>
      <ul className="space-y-1">
        {cards.map((card) => (
          <li key={card.data.name}>
            <button
              type="button"
              onClick={() => void open(card.data.name.toLowerCase())}
              className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm text-stone-600 hover:bg-stone-100"
            >
              <span>{card.data.name}</span>
              <span className="text-[10px] text-stone-400">{COMPANION_COPY.aiLabel}</span>
            </button>
          </li>
        ))}
      </ul>
      {activeProposal && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-stone-600">
          <p>{COMPANION_COPY.proposal(proposalCompanionName, activeProposal.topic)}</p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => void acceptProposal()}
              className="rounded bg-amber-100 px-2 py-0.5 text-stone-700 hover:bg-amber-200"
            >
              {COMPANION_COPY.accept}
            </button>
            <button
              type="button"
              onClick={() => void declineProposal()}
              className="rounded px-2 py-0.5 text-stone-500 hover:bg-stone-100"
            >
              {COMPANION_COPY.decline}
            </button>
          </div>
        </div>
      )}
      {declineEcho && <p className="mt-1 text-stone-400 text-xs">{declineEcho}</p>}
    </section>
  );
}
