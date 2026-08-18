/**
 * Purpose: the discovery page (spec 051 §1, spec 053) — a quiet header row (the familiar/new
 * switch on the left, the way into 收藏 on the right) above the card grid, the reader overlay for
 * whichever item is open, and, the very first time, the one-screen panel that asks which fields
 * the reader is interested in before the first cards land.
 * Main exports: DiscoveryView.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useEffect, useRef, useState } from "react";
import { hasRecordedOnboardingStances } from "../lib/discoveryFeedbackEvents";
import { holdScrollPosition } from "../lib/scrollPositionHold";
import { ensureDiscoveryChannelSettingsLoaded } from "../stores/discoveryChannelSettingsStore";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { DiscoveryCardGrid } from "./DiscoveryCardGrid";
import { DiscoveryFeedDial } from "./DiscoveryFeedDial";
import { DiscoveryOnboarding } from "./DiscoveryOnboarding";
import { DiscoveryReaderOverlay } from "./DiscoveryReaderOverlay";
import { DiscoverySavedOverlay } from "./DiscoverySavedOverlay";

export function DiscoveryView() {
  const cards = useDiscoveryStore((state) => state.cards);
  const loading = useDiscoveryStore((state) => state.loading);
  const blockedReason = useDiscoveryStore((state) => state.blockedReason);
  const [openCard, setOpenCard] = useState<DiscoveryCardRow | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  /** null while the answer is still being read out of the database — neither surface is shown
   * yet, so the panel cannot flash over a feed that turns out not to need it. */
  const [onboardingNeeded, setOnboardingNeeded] = useState<boolean | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const overlayOpen = savedOpen || openCard !== null;

  // The feed keeps its place while a layer is over it: nothing behind can scroll, and the exact
  // position comes back on close, so closing an item returns to the card it was opened from.
  useEffect(() => {
    if (!overlayOpen) return;
    return holdScrollPosition([feedRef.current, document.body]);
  }, [overlayOpen]);

  useEffect(() => {
    void (async () => {
      const settings = await ensureDiscoveryChannelSettingsLoaded();
      const needed = !settings.onboardingDismissed && !(await hasRecordedOnboardingStances());
      setOnboardingNeeded(needed);
      if (!needed) await useDiscoveryStore.getState().loadInitial();
    })();
  }, []);

  if (onboardingNeeded === null) return <div className="h-full bg-stone-50" />;

  if (onboardingNeeded) {
    return (
      <div className="h-full overflow-y-auto bg-stone-50 p-6">
        <DiscoveryOnboarding
          onDone={() => {
            setOnboardingNeeded(false);
            void useDiscoveryStore.getState().loadInitial();
          }}
        />
      </div>
    );
  }

  const empty = cards.length === 0 && !loading;

  return (
    <div ref={feedRef} className="h-full overflow-y-auto bg-stone-50 p-6">
      <div className="mb-4 flex items-center gap-3">
        <DiscoveryFeedDial />
        <button
          type="button"
          onClick={() => setSavedOpen(true)}
          className="ml-auto rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-700"
        >
          收藏
        </button>
      </div>
      {empty ? (
        <div className="mx-auto mt-24 max-w-sm text-center">
          {blockedReason === null ? (
            <p className="text-stone-500">翻一翻，遇到想深入的就点开。</p>
          ) : (
            <>
              <p className="text-sm text-stone-400">{blockedReason}</p>
              <button
                type="button"
                onClick={() => void useDiscoveryStore.getState().loadMore()}
                className="mt-4 rounded-xl border border-amber-400 border-dashed px-4 py-2 text-amber-600 text-sm hover:bg-amber-50"
              >
                重试
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {blockedReason !== null && (
            <p className="mb-4 text-center text-sm text-stone-400">{blockedReason}</p>
          )}
          <DiscoveryCardGrid cards={cards} loading={loading} onOpen={setOpenCard} />
        </>
      )}
      {/* Both layers are written here because this is where their state lives, but each renders
          into the body and covers the window — not this scrolled feed (Leo's report 2026-08-18).
          A row of the 收藏 list opens the reader on top of the list, and closing it comes back
          to the list. */}
      {savedOpen && (
        <DiscoverySavedOverlay onOpenCard={setOpenCard} onClose={() => setSavedOpen(false)} />
      )}
      {openCard !== null && (
        <DiscoveryReaderOverlay card={openCard} onClose={() => setOpenCard(null)} />
      )}
    </div>
  );
}
