/**
 * Purpose: the companions roster rows (spec 037), rendered inside the 👥 flyout that
 * slides out over the center area (Leo 2026-08-15: roster and recents are different
 * things). A pending invitation shows only as a small unread dot, cleared on opening the
 * chat. Hidden entirely when the companion chat switch is off (product principle 3).
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
    <section className="mb-2">
      <h3 className="mb-1 px-3 text-[11px] text-stone-400">{COMPANION_COPY.sectionTitle}</h3>
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
                <span className="flex items-center gap-2">
                  <span>{card.data.name}</span>
                  {proposal !== null && !proposalSeen && (
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                  )}
                  <span className="ml-auto text-[10px] text-stone-400">
                    {COMPANION_DESKTOP_COPY.roleLabels[card.data.extensions.breadcrumb.role] ??
                      COMPANION_COPY.aiLabel}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
