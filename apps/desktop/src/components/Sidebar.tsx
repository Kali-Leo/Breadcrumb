/**
 * Purpose: left column — new-chat button, the conversation list (companion chats appear in
 * it by recency like any conversation), and the bottom icon row: the companions button
 * (opens the center flyout, carries the unread dot), the view switcher and the
 * connectivity dot that replaced the status bar. (Leo 2026-08-15: roster and recents are
 * different things — the roster lives behind 👥, not inside the list.)
 * Main exports: Sidebar.
 */
import { ALargeSmall, Compass, Map as MapIcon, Settings, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../stores/chatStore";
import { useCompanionStore } from "../stores/companionStore";
import { useSettingsStore } from "../stores/settingsStore";
import { PalaceRail } from "./map/PalaceRail";
import { TrailList } from "./TrailList";

interface SidebarProps {
  activeView: "chat" | "settings" | "map" | "vocab" | "discovery";
  companionsOpen: boolean;
  onOpenChat(): void;
  onOpenSettings(): void;
  onOpenMap(): void;
  onOpenVocab(): void;
  onOpenDiscovery(): void;
  onToggleCompanions(): void;
}

/** Offline indicator (spec 048 follow-up, Leo: an unexplained always-on dot is bad
 * design) — the normal online state shows nothing at all; only being offline earns a
 * quiet grey dot with its explanation on hover. */
function ConnectivityDot() {
  const { t } = useTranslation("common");
  const networkEnabled = useSettingsStore((state) => state.networkEnabled);
  if (networkEnabled) return null;
  return (
    <span title={t("nav.offline")} className="h-2 w-2 cursor-help rounded-full bg-stone-300" />
  );
}

/** The companions roster button — hidden with the companionChat switch, dotted while an
 * invitation waits unread. */
function CompanionsButton({ open, onToggle }: { open: boolean; onToggle(): void }) {
  const { t } = useTranslation("common");
  const companionChatEnabled = useSettingsStore((state) => state.featureSwitches.companionChat);
  const helpers = useCompanionStore((state) => state.helpers);
  const seenHelperIds = useCompanionStore((state) => state.seenHelperIds);
  if (!companionChatEnabled) return null;
  const unread = helpers.some((helper) => !seenHelperIds.has(helper.companion_id));
  return (
    <button
      type="button"
      onClick={onToggle}
      title={t("nav.friends")}
      aria-label={t("nav.friends")}
      className={`relative rounded-lg px-2 py-1.5 transition-colors ${
        open ? "bg-amber-100 text-stone-700" : "text-stone-500 hover:bg-stone-100"
      }`}
    >
      <Users size={19} strokeWidth={1.8} />
      {unread && (
        <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-rose-400" />
      )}
    </button>
  );
}

export function Sidebar({
  activeView,
  companionsOpen,
  onOpenChat,
  onOpenSettings,
  onOpenMap,
  onOpenVocab,
  onOpenDiscovery,
  onToggleCompanions,
}: SidebarProps) {
  const { t } = useTranslation("common");
  const startNewConversation = useChatStore((state) => state.startNewConversation);

  return (
    <aside className="flex h-full w-60 flex-col border-e border-stone-200 bg-white">
      <div className="flex items-center gap-2 p-3">
        <span className="text-xl">🍞</span>
        <span className="font-semibold text-stone-700">Breadcrumb</span>
      </div>
      <button
        type="button"
        onClick={() => {
          void startNewConversation();
          onOpenChat();
        }}
        className="mx-3 mb-2 rounded-xl border border-dashed border-amber-400 px-3 py-2 text-sm text-amber-600 transition-colors hover:bg-amber-50"
      >
        ＋ {t("nav.newChat")}
      </button>
      <nav className="flex-1 overflow-y-auto px-2">
        {/* In the palace the left rail carries goals and continue-from-here (Leo, spec 050
            §5); everywhere else it is the conversation history. */}
        {activeView === "map" ? (
          <PalaceRail />
        ) : (
          <TrailList isChatViewActive={activeView === "chat"} onOpenChat={onOpenChat} />
        )}
      </nav>
      {/* Icon order and even spread are Leo's 2026-08-16 layout: 设置 · 词汇 · 地图 · 好友,
          with 发现 added in front of the map (spec 057).
          One Lucide line-icon set (emoji mixed with a text glyph could never look uniform). */}
      <div className="flex items-center border-t border-stone-100 px-2 py-2">
        <ConnectivityDot />
        <div className="flex flex-1 items-center justify-evenly">
          {(
            [
              [Settings, t("nav.settings"), onOpenSettings, activeView === "settings"],
              [ALargeSmall, t("nav.vocabulary"), onOpenVocab, activeView === "vocab"],
              [Compass, t("nav.discover"), onOpenDiscovery, activeView === "discovery"],
              [MapIcon, t("nav.map"), onOpenMap, activeView === "map"],
            ] as const
          ).map(([Icon, name, onClick, active]) => (
            <button
              key={name}
              type="button"
              onClick={onClick}
              title={name}
              aria-label={name}
              className={`rounded-lg px-2 py-1.5 transition-colors ${
                active ? "bg-amber-100 text-stone-700" : "text-stone-500 hover:bg-stone-100"
              }`}
            >
              <Icon size={19} strokeWidth={1.8} />
            </button>
          ))}
          <CompanionsButton open={companionsOpen} onToggle={onToggleCompanions} />
        </div>
      </div>
    </aside>
  );
}
