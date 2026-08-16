/**
 * Purpose: the discovery feed page (spec 051 §1) — loads the initial card batch on mount,
 * shows the empty-state first line with a plain 开始/换一批 affordance (or the blocked-reason
 * banner instead, when generation isn't possible), and hosts the card grid plus the article
 * overlay for whichever card is open.
 * Main exports: DiscoveryView.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useEffect, useState } from "react";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { DiscoveryArticleOverlay } from "./DiscoveryArticleOverlay";
import { DiscoveryCardGrid } from "./DiscoveryCardGrid";

export function DiscoveryView() {
  const cards = useDiscoveryStore((state) => state.cards);
  const loading = useDiscoveryStore((state) => state.loading);
  const blockedReason = useDiscoveryStore((state) => state.blockedReason);
  const [openCard, setOpenCard] = useState<DiscoveryCardRow | null>(null);
  const [everHadCards, setEverHadCards] = useState(false);

  useEffect(() => {
    void useDiscoveryStore.getState().loadInitial();
  }, []);

  useEffect(() => {
    if (cards.length > 0) setEverHadCards(true);
  }, [cards.length]);

  const empty = cards.length === 0 && !loading;

  return (
    <div className="relative h-full overflow-y-auto bg-stone-50 p-6">
      {empty ? (
        <div className="mx-auto mt-24 max-w-sm text-center">
          <p className="text-stone-500">翻一翻，遇到想深入的就点开。</p>
          {blockedReason === null ? (
            <button
              type="button"
              onClick={() => void useDiscoveryStore.getState().loadMore()}
              className="mt-4 rounded-xl border border-dashed border-amber-400 px-4 py-2 text-sm text-amber-600 hover:bg-amber-50"
            >
              {everHadCards ? "换一批" : "开始"}
            </button>
          ) : (
            <p className="mt-3 text-sm text-stone-400">{blockedReason}</p>
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
      {openCard !== null && (
        <DiscoveryArticleOverlay card={openCard} onClose={() => setOpenCard(null)} />
      )}
    </div>
  );
}
