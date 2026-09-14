/**
 * Purpose: the sidebar plus what stacked screens need around it — the thin top bar with the
 * menu button, the scrim behind the open drawer, and the open/closed state. On a wide screen
 * every one of those is display:none and the sidebar is the permanent column it always was;
 * this component adds nothing to that layout.
 *
 * The drawer closes on the scrim, on Escape, on its ✕, and whenever something in it is
 * chosen — a conversation, a view, the roster — because after choosing, the content is what
 * the person wants to see.
 * Main exports: ShellSidebar.
 */
import { Menu } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLayoutMode } from "../../lib/platform/layoutMode";
import { Sidebar, type SidebarProps } from "../Sidebar";

export function ShellSidebar(props: SidebarProps) {
  const { t } = useTranslation("common");
  const stacked = useLayoutMode() === "stacked";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const close = useCallback(() => setDrawerOpen(false), []);

  // Turning the tablet to landscape makes the column permanent; the open state must not
  // linger to spring the drawer open on the way back.
  useEffect(() => {
    if (!stacked) setDrawerOpen(false);
  }, [stacked]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, close]);

  const closing = (action: () => void) => () => {
    action();
    close();
  };

  return (
    <>
      <header className="hidden min-h-11 shrink-0 items-center border-b border-stone-200 bg-white pt-[env(safe-area-inset-top)] stacked:flex">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t("nav.menu")}
          aria-expanded={drawerOpen}
          className="flex h-11 w-11 items-center justify-center text-stone-600"
        >
          <Menu size={22} strokeWidth={1.8} />
        </button>
      </header>
      {drawerOpen && (
        <button
          type="button"
          onClick={close}
          aria-label={t("nav.closeMenu")}
          className="fixed inset-0 z-30 hidden cursor-default bg-stone-900/30 stacked:block"
        />
      )}
      <Sidebar
        activeView={props.activeView}
        companionsOpen={props.companionsOpen}
        onOpenChat={closing(props.onOpenChat)}
        onOpenSettings={closing(props.onOpenSettings)}
        onOpenMap={closing(props.onOpenMap)}
        onOpenVocab={closing(props.onOpenVocab)}
        onOpenDiscovery={closing(props.onOpenDiscovery)}
        onOpenLibrary={closing(props.onOpenLibrary)}
        onToggleCompanions={closing(props.onToggleCompanions)}
        drawerOpen={drawerOpen}
        onCloseDrawer={close}
      />
    </>
  );
}
