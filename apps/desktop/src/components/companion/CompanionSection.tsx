/**
 * Purpose: the daily helpers roster inside the 👥 flyout (spec 050 §9) — today's
 * help-seeking characters, each anchored to a concept the system judged worth revisiting;
 * clicking one opens the floating chat popup (never the main chat view). Handled helpers
 * are gone for the day; tomorrow brings a fresh batch. Hidden entirely when the companion
 * chat switch is off (product principle 3).
 * Main exports: CompanionSection.
 */
import { COMPANION_COPY } from "@breadcrumb/feature-companion";
import { useTranslation } from "react-i18next";
import { startHelperConversation } from "../../lib/companion/companionActions";
import { appEventBus } from "../../stores/chatStore";
import { useCompanionStore } from "../../stores/companionStore";
import { useSettingsStore } from "../../stores/settingsStore";

interface CompanionSectionProps {
  /** Called after a helper is picked so the flyout can close. */
  onPicked(): void;
}

export function CompanionSection({ onPicked }: CompanionSectionProps) {
  const { t } = useTranslation(["chat", "common"]);
  const companionChatEnabled = useSettingsStore((state) => state.featureSwitches.companionChat);
  const helpers = useCompanionStore((state) => state.helpers);
  const seenHelperIds = useCompanionStore((state) => state.seenHelperIds);

  if (!companionChatEnabled) return null;

  const open = async (helperId: string, topic: string) => {
    useCompanionStore.getState().markHelperSeen(helperId);
    const conversationId = await startHelperConversation(helperId, topic);
    appEventBus.emit("companion:openPopup", {
      conversationId,
      title: COMPANION_COPY.helperName(topic),
    });
    onPicked();
  };

  return (
    <section>
      <h3 className="mb-1 px-1 text-[11px] text-stone-400">{t("common:nav.friends")}</h3>
      {helpers.length === 0 ? (
        <p className="px-1 py-1 text-xs text-stone-400">{t("companion.rosterEmpty")}</p>
      ) : (
        <ul className="space-y-1">
          {helpers.map((helper) => (
            <li key={helper.id}>
              <button
                type="button"
                onClick={() => void open(helper.companion_id, helper.topic)}
                className="w-full rounded-lg px-2 py-1.5 text-start text-sm text-stone-600 hover:bg-stone-100 coarse:flex coarse:min-h-11 coarse:items-center"
              >
                <span className="flex items-center gap-2">
                  <span className="truncate">{COMPANION_COPY.helperName(helper.topic)}</span>
                  {!seenHelperIds.has(helper.companion_id) && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
