/**
 * Purpose: the sidebar's bottom row — the connectivity dot, the view switcher and the
 * companions button. With a mouse it is the icon row Leo laid out on 2026-08-16 (设置 · 词汇 ·
 * 地图 · 好友, names on hover); on a touch screen or in the drawer each icon carries its name
 * underneath and grows to a 44px target, because a finger cannot hover and a tooltip it
 * cannot reach is no name at all.
 * Main exports: SidebarNav, NavEntry.
 */
import type { LucideIcon } from "lucide-react";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCompanionStore } from "../stores/companionStore";
import { useSettingsStore } from "../stores/settingsStore";

/** One button in the bottom row: icon, its name, what it opens, whether it is the open one. */
export type NavEntry = readonly [LucideIcon, string, () => void, boolean];

/** Icon-only with a mouse; icon over name, 44px tall, on touch and in the drawer. */
const NAV_BUTTON =
  "rounded-lg px-2 py-1.5 transition-colors coarse:flex coarse:min-h-11 coarse:min-w-11 coarse:flex-col coarse:items-center coarse:justify-center coarse:gap-0.5 stacked:flex stacked:min-h-11 stacked:min-w-11 stacked:flex-col stacked:items-center stacked:justify-center stacked:gap-0.5";
const NAV_LABEL = "hidden text-[11px] leading-none coarse:block stacked:block";

/** Offline indicator (spec 048 follow-up, Leo: an unexplained always-on dot is bad
 * design) — the normal online state shows nothing at all; only being offline earns a
 * quiet grey dot with its explanation on hover, or written out beside it on touch. */
function ConnectivityDot() {
  const { t } = useTranslation("common");
  const networkEnabled = useSettingsStore((state) => state.networkEnabled);
  if (networkEnabled) return null;
  return (
    <span className="flex items-center gap-1.5 coarse:mb-1 coarse:basis-full">
      <span
        title={t("nav.offline")}
        className="h-2 w-2 shrink-0 cursor-help rounded-full bg-stone-300"
      />
      <span className="hidden text-stone-400 text-xs coarse:inline">{t("nav.offline")}</span>
    </span>
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
      className={`relative ${NAV_BUTTON} ${
        open ? "bg-amber-100 text-stone-700" : "text-stone-500 hover:bg-stone-100"
      }`}
    >
      <Users size={19} strokeWidth={1.8} />
      <span className={NAV_LABEL}>{t("nav.friends")}</span>
      {unread && <span className="absolute end-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-rose-400" />}
    </button>
  );
}

interface SidebarNavProps {
  entries: NavEntry[];
  companionsOpen: boolean;
  onToggleCompanions(): void;
}

export function SidebarNav({ entries, companionsOpen, onToggleCompanions }: SidebarNavProps) {
  return (
    // Bottom padding grows by the safe area: a home indicator must never sit on this row.
    <div className="flex items-center border-t border-stone-100 px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] coarse:flex-wrap">
      <ConnectivityDot />
      <div className="flex flex-1 items-center justify-evenly">
        {entries.map(([Icon, name, onClick, active]) => (
          <button
            key={name}
            type="button"
            onClick={onClick}
            title={name}
            aria-label={name}
            className={`${NAV_BUTTON} ${
              active ? "bg-amber-100 text-stone-700" : "text-stone-500 hover:bg-stone-100"
            }`}
          >
            <Icon size={19} strokeWidth={1.8} />
            <span className={NAV_LABEL}>{name}</span>
          </button>
        ))}
        <CompanionsButton open={companionsOpen} onToggle={onToggleCompanions} />
      </div>
    </div>
  );
}
