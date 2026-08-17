/**
 * Purpose: the discovery feed page (spec 051 §1) — loads cards on mount without any manual
 * start affordance (the batch generates by itself; skeletons cover the wait), shows the
 * blocked reason with a retry button when generation isn't possible, and hosts the card grid
 * plus the article overlay for whichever card is open.
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

  useEffect(() => {
    void useDiscoveryStore.getState().loadInitial();
  }, []);

  const empty = cards.length === 0 && !loading;

  return (
    <div className="relative h-full overflow-y-auto bg-stone-50 p-6">
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
                className="mt-4 rounded-xl border border-dashed border-amber-400 px-4 py-2 text-sm text-amber-600 hover:bg-amber-50"
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
      {openCard !== null && (
        <DiscoveryArticleOverlay card={openCard} onClose={() => setOpenCard(null)} />
      )}
    </div>
  );
}
