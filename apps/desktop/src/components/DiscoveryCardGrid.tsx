/**
 * Purpose: the discovery feed's card grid (spec 051 §1, regeometried by spec 054 §(b)) — as many
 * columns as fit at a sensible card width rather than a fixed number per breakpoint, pulsing
 * skeleton placeholders shaped like real cards while a batch loads (no spinner text), and a bottom
 * sentinel that triggers loadMore once it scrolls into view.
 *
 * The column count and the card width the numbers below produce live in lib/discoveryFeedGrid,
 * where they can be checked without a browser.
 * Main exports: DiscoveryCardGrid.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useEffect, useRef } from "react";
import {
  FEED_GRID_GAP_PX,
  FEED_GRID_MAX_CONTENT_PX,
  FEED_GRID_MAXIMUM_CARD_PX,
  feedGridTemplateColumns,
} from "../lib/discoveryFeedGrid";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { useSettingsStore } from "../stores/settingsStore";
import { DiscoveryCardTile } from "./DiscoveryCardTile";

const SKELETON_COUNT = 8;

/** Built from the same parts as a real card — a 16:9 picture area and two lines of text — so a
 * loading grid is the shape the cards will be and nothing jumps when they land. */
function SkeletonCard() {
  return (
    <div
      className="w-full animate-pulse overflow-hidden rounded-2xl bg-white shadow-sm"
      style={{ maxWidth: `${FEED_GRID_MAXIMUM_CARD_PX}px` }}
    >
      <div className="w-full bg-stone-100 pt-[56.25%]" />
      <div className="px-4 pt-4 pb-6">
        <div className="h-3 w-1/3 rounded bg-stone-100" />
        <div className="mt-3 h-3 w-11/12 rounded bg-stone-100" />
        <div className="mt-2 h-3 w-2/3 rounded bg-stone-100" />
      </div>
    </div>
  );
}

interface DiscoveryCardGridProps {
  cards: readonly DiscoveryCardRow[];
  loading: boolean;
  onOpen(card: DiscoveryCardRow): void;
}

export function DiscoveryCardGrid({ cards, loading, onOpen }: DiscoveryCardGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cardSize = useSettingsStore((state) => state.discoveryCardSize);

  // Re-created whenever the card count changes: an IntersectionObserver only fires on
  // visibility CROSSINGS, so a sentinel that stays in view after a load would never fire
  // again — re-observing reports the current state once and keeps filling tall windows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: cards.length is the re-observe trigger
  useEffect(() => {
    const element = sentinelRef.current;
    if (element === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void useDiscoveryStore.getState().loadMore();
        }
      },
      // Fire well before the reader reaches the end, so the next batch is usually ready.
      { threshold: 0.1, rootMargin: "900px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [cards.length]);

  return (
    <div>
      <div
        data-testid="discovery-card-grid"
        className="mx-auto grid"
        style={{
          gridTemplateColumns: feedGridTemplateColumns(cardSize),
          gap: `${FEED_GRID_GAP_PX}px`,
          maxWidth: `${FEED_GRID_MAX_CONTENT_PX}px`,
          // Cards carry their own ceiling; on a window too narrow for two columns the one card
          // sits centred at that ceiling instead of stretching across the whole feed.
          justifyItems: "center",
        }}
      >
        {cards.map((card) => (
          <DiscoveryCardTile key={card.id} card={card} onOpen={onOpen} />
        ))}
        {loading &&
          Array.from({ length: SKELETON_COUNT }, (_, index) => index).map((index) => (
            <SkeletonCard key={`skeleton-${index}`} />
          ))}
      </div>
      {cards.length > 0 && <div ref={sentinelRef} className="h-1" />}
    </div>
  );
}
