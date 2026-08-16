/**
 * Purpose: companion-cast chat extras (spec 037) — a slim "which companion, AI-labeled" header
 * badge for companion chats and companion-played teach sessions, plus the crisis and break
 * banners. Renders nothing when the active conversation isn't companion-flavored and nothing
 * is active. Main exports: CompanionChatBanners.
 */
import { BREAK_REMINDER_COPY, COMPANION_COPY, CRISIS_RESPONSE } from "@breadcrumb/plugin-companion";
import { COMPANION_DESKTOP_COPY, getCompanionCardById } from "../lib/companionActions";
import { teachTopicFromTitle } from "../lib/teachActions";
import { useChatStore } from "../stores/chatStore";
import { useCompanionStore } from "../stores/companionStore";

export function CompanionChatBanners() {
  const activeKind = useChatStore((state) => state.activeKind);
  const activeCompanionId = useChatStore((state) => state.activeCompanionId);
  const crisisActive = useCompanionStore((state) => state.crisisActive);
  const breakReminderActive = useCompanionStore((state) => state.breakReminderActive);
  const dismissCrisis = useCompanionStore((state) => state.dismissCrisis);
  const dismissBreakReminder = useCompanionStore((state) => state.dismissBreakReminder);

  const activeTitle = useChatStore(
    (state) =>
      state.conversations.find((conversation) => conversation.id === state.activeConversationId)
        ?.title ?? null,
  );

  const isCompanionThread =
    (activeKind === "companion" || activeKind === "teach") && activeCompanionId !== null;
  const card = activeCompanionId !== null ? getCompanionCardById(activeCompanionId) : undefined;
  // Daily helpers have no fixed card — their display name derives from the topic (spec 050 §9).
  const helperName =
    card === undefined && activeTitle !== null
      ? COMPANION_COPY.helperRowName(teachTopicFromTitle(activeTitle))
      : null;
  const displayName = card?.data.name ?? helperName;

  return (
    <>
      {isCompanionThread && displayName !== null && (
        <div className="flex items-center gap-2 border-b border-stone-100 bg-white px-4 py-1.5 text-xs text-stone-500">
          <span className="font-medium text-stone-600">{displayName}</span>
          <span>{COMPANION_COPY.aiLabel}</span>
        </div>
      )}
      {crisisActive && (
        <div className="mx-4 mt-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-stone-700">
          <p>{CRISIS_RESPONSE}</p>
          <button
            type="button"
            onClick={dismissCrisis}
            className="mt-1 text-stone-400 text-xs underline"
          >
            {COMPANION_DESKTOP_COPY.dismiss}
          </button>
        </div>
      )}
      {breakReminderActive && (
        <div className="mx-4 mt-2 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-2 text-sm text-stone-600">
          <span>{BREAK_REMINDER_COPY}</span>
          <button
            type="button"
            onClick={dismissBreakReminder}
            className="text-stone-400 text-xs underline"
          >
            {COMPANION_DESKTOP_COPY.dismiss}
          </button>
        </div>
      )}
    </>
  );
}
