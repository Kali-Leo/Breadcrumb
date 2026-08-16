/**
 * Purpose: the discovery feed's responsive card grid (spec 051 §1) — 2/3/4 columns as the
 * window widens, pulsing skeleton placeholders while a batch generates (no spinner text), and
 * a bottom sentinel that triggers loadMore once it scrolls into view.
 * Main exports: DiscoveryCardGrid.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useEffect, useRef } from "react";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { DiscoveryCardTile } from "./DiscoveryCardTile";

const SKELETON_COUNT = 8;

function SkeletonCard() {
  return <div className="h-28 animate-pulse rounded-2xl bg-white shadow-sm" />;
}

interface DiscoveryCardGridProps {
  cards: readonly DiscoveryCardRow[];
  loading: boolean;
  onOpen(card: DiscoveryCardRow): void;
}

export function DiscoveryCardGrid({ cards, loading, onOpen }: DiscoveryCardGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

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
      { threshold: 0.1 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [cards.length]);

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
