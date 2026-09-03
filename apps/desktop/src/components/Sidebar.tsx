/**
 * Purpose: left column — new-chat button, the conversation list (companion chats appear in
 * it by recency like any conversation), and the bottom row (SidebarNav): the companions
 * button, the view switcher and the connectivity dot that replaced the status bar. (Leo
 * 2026-08-15: roster and recents are different things — the roster lives behind 👥, not
 * inside the list.)
 *
 * Wide screens keep it as a 240px column. Stacked screens (narrow or portrait — an iPad held
 * upright, a phone) have no room for a permanent column, so the same element becomes a
 * drawer: off-screen until the menu button in the top bar opens it, sliding in over the
 * content, closed by the scrim, Escape, the ✕, or choosing anything in it (ShellSidebar owns
 * that state). Inert while closed so nothing in it can take focus.
 * Main exports: Sidebar, SidebarProps.
 */
import { ALargeSmall, Compass, Map as MapIcon, Settings, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isBrowserEdition } from "../lib/platform/edition";
import { useLayoutMode } from "../lib/platform/layoutMode";
import { useChatStore } from "../stores/chatStore";
import { PalaceRail } from "./map/PalaceRail";
import { type NavEntry, SidebarNav } from "./SidebarNav";
import { TrailList } from "./trail/TrailList";

export interface SidebarProps {
  activeView: "chat" | "settings" | "map" | "vocab" | "discovery";
  companionsOpen: boolean;
  onOpenChat(): void;
  onOpenSettings(): void;
  onOpenMap(): void;
  onOpenVocab(): void;
  onOpenDiscovery(): void;
  onToggleCompanions(): void;
}

interface SidebarDrawerProps extends SidebarProps {
  /** Only meaningful on a stacked screen; ignored while the column is permanent. */
  drawerOpen: boolean;
  onCloseDrawer(): void;
}

/** The column, and on stacked screens the drawer it turns into: fixed over the content,
 * 280px or 85% of the width, whichever is smaller, slid out of view along the start edge
 * while closed. Left padding follows the safe area for a notch in landscape. */
const ASIDE =
  "flex h-full w-60 flex-col border-e border-stone-200 bg-white stacked:fixed stacked:inset-y-0 stacked:start-0 stacked:z-40 stacked:w-[min(280px,85vw)] stacked:ps-[env(safe-area-inset-left)] stacked:shadow-xl stacked:transition-transform stacked:duration-200";
const ASIDE_OPEN = "stacked:translate-x-0";
const ASIDE_CLOSED = "stacked:-translate-x-full stacked:rtl:translate-x-full";

export function Sidebar({
  activeView,
  companionsOpen,
  onOpenChat,
  onOpenSettings,
  onOpenMap,
  onOpenVocab,
  onOpenDiscovery,
  onToggleCompanions,
  drawerOpen,
  onCloseDrawer,
}: SidebarDrawerProps) {
  const { t } = useTranslation("common");
  const startNewConversation = useChatStore((state) => state.startNewConversation);
  const stacked = useLayoutMode() === "stacked";
  const hiddenDrawer = stacked && !drawerOpen;

  const navEntries: NavEntry[] = [
    [Settings, t("nav.settings"), onOpenSettings, activeView === "settings"],
    [ALargeSmall, t("nav.vocabulary"), onOpenVocab, activeView === "vocab"],
    [MapIcon, t("nav.map"), onOpenMap, activeView === "map"],
  ];
  // Discovery reads a program running on this machine, which a web page cannot reach and
  // should not try to. In the browser edition there is no entry at all, rather than one that
  // opens a page whose only content would be an apology.
  if (!isBrowserEdition()) {
    navEntries.splice(2, 0, [
      Compass,
      t("nav.discover"),
      onOpenDiscovery,
      activeView === "discovery",
    ]);
  }

  return (
    <aside
      data-shell="sidebar"
      inert={hiddenDrawer || undefined}
      aria-hidden={hiddenDrawer || undefined}
      className={`${ASIDE} ${drawerOpen ? ASIDE_OPEN : ASIDE_CLOSED}`}
    >
      {/* Top padding follows the safe area (the status bar when installed to a home screen). */}
      <div className="flex items-center gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <span className="text-xl">🍞</span>
        <span className="font-semibold text-stone-700">Breadcrumb</span>
        <button
          type="button"
          onClick={onCloseDrawer}
          aria-label={t("nav.closeMenu")}
          className="ms-auto hidden h-11 w-11 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 stacked:flex"
        >
          <X size={20} strokeWidth={1.8} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          void startNewConversation();
          onOpenChat();
        }}
        className="mx-3 mb-2 rounded-xl border border-dashed border-amber-400 px-3 py-2 text-sm text-amber-600 transition-colors hover:bg-amber-50 coarse:min-h-11"
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
      <SidebarNav
        entries={navEntries}
        companionsOpen={companionsOpen}
        onToggleCompanions={onToggleCompanions}
      />
    </aside>
  );
}
