/**
 * Purpose: sidebar "伙伴" section (spec 037) — three companion rows to open/continue a chat,
 * chat-list style (Leo 2026-08-15): a pending teach-back proposal shows as that companion's
 * last-message preview with an unread dot, like WeChat/QQ; the invitation itself lives inside
 * the chat (CompanionProposalBubble). Hidden entirely when the companion chat switch is off
 * (product principle 3 — every metered environment is fully removable).
 * Main exports: CompanionSection.
 */
import { COMPANION_COPY } from "@breadcrumb/plugin-companion";
import { COMPANION_DESKTOP_COPY, openCompanionConversation } from "../lib/companionActions";
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
  const proposalSeen = useCompanionStore((state) => state.proposalSeen);
  const openConversation = useChatStore((state) => state.openConversation);

  if (!companionChatEnabled) return null;

  const open = async (companionId: string) => {
    const conversationId = await openCompanionConversation(companionId);
    await openConversation(conversationId);
    onOpenChat();
  };

  return (
    <section className="mx-3 mb-2">
      <h3 className="mb-1 font-semibold text-stone-600">{COMPANION_COPY.sectionTitle}</h3>
      <p className="mb-2 text-stone-400 text-xs">{COMPANION_DESKTOP_COPY.sectionHint}</p>
      <ul className="space-y-1">
        {cards.map((card) => {
          const companionId = card.data.name.toLowerCase();
          const proposal =
            activeProposal !== null && activeProposal.companion_id === companionId
              ? activeProposal
              : null;
          return (
            <li key={card.data.name}>
              <button
                type="button"
                onClick={() => void open(companionId)}
                className="w-full rounded-lg px-3 py-1.5 text-left text-sm text-stone-600 hover:bg-stone-100"
              >
                <span className="block">{card.data.name}</span>
                {proposal !== null && (
                  <span className="mt-0.5 flex items-center gap-1.5">
                    {!proposalSeen && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                    )}
                    <span className="truncate text-stone-400 text-xs">
                      {COMPANION_COPY.proposalPreview(proposal.topic)}
                    </span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
