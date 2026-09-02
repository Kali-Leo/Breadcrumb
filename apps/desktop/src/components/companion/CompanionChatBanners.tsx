/**
 * Purpose: companion-cast chat extras (spec 037) — a slim "which companion, AI-labeled" header
 * badge for companion chats and companion-played teach sessions, plus the crisis and break
 * banners. Renders nothing when the active conversation isn't companion-flavored and nothing
 * is active. Main exports: CompanionChatBanners.
 */
import {
  BREAK_REMINDER_COPY,
  COMPANION_COPY,
  CRISIS_RESPONSE,
} from "@breadcrumb/feature-companion";
import { useTranslation } from "react-i18next";
import { useCopyMessage } from "../../i18n/useCopyMessage";
import { getCompanionCardById } from "../../lib/companion/companionActions";
import { teachTopicFromTitle } from "../../lib/companion/teachActions";
import { useChatStore } from "../../stores/chatStore";
import { useCompanionStore } from "../../stores/companionStore";

export function CompanionChatBanners() {
  const { t } = useTranslation(["chat", "common"]);
  const copy = useCopyMessage();
  const activeKind = useChatStore((state) => state.activeKind);
  const activeCompanionId = useChatStore((state) => state.activeCompanionId);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const crisisConversationIds = useCompanionStore((state) => state.crisisConversationIds);
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
      ? COMPANION_COPY.helperName(teachTopicFromTitle(activeTitle))
      : null;
  const displayName = card?.data.name ?? helperName;

  return (
    <>
      {isCompanionThread && displayName !== null && (
        <div className="flex items-center gap-2 border-b border-stone-100 bg-white px-4 py-1.5 text-xs text-stone-500">
          <span className="font-medium text-stone-600">{displayName}</span>
          <span>{t("companion.aiLabel")}</span>
        </div>
      )}
      {activeConversationId !== null && crisisConversationIds.has(activeConversationId) && (
        <div className="mx-4 mt-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-stone-700">
          <p>{copy(CRISIS_RESPONSE)}</p>
          <button
            type="button"
            onClick={() => activeConversationId !== null && dismissCrisis(activeConversationId)}
            className="mt-1 text-stone-400 text-xs underline"
          >
            {t("common:actions.gotIt")}
          </button>
        </div>
      )}
      {breakReminderActive && (
        <div className="mx-4 mt-2 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-2 text-sm text-stone-600">
          <span>{copy(BREAK_REMINDER_COPY)}</span>
          <button
            type="button"
            onClick={dismissBreakReminder}
            className="text-stone-400 text-xs underline"
          >
            {t("common:actions.gotIt")}
          </button>
        </div>
      )}
    </>
  );
}
