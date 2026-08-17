/**
 * Purpose: one discovery-feed card (spec 051 §1) — title + hook, a silent impression
 * IntersectionObserver (≥50% visible for ≥1s fires once), and a hover-revealed 「不感兴趣」
 * control that removes the card from the grid with no confirmation.
 * Main exports: DiscoveryCardTile.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useEffect, useRef } from "react";
import { useDiscoveryStore } from "../stores/discoveryStore";

const IMPRESSION_VISIBLE_MS = 1000;
const IMPRESSION_VISIBLE_THRESHOLD = 0.5;

interface DiscoveryCardTileProps {
  card: DiscoveryCardRow;
  onOpen(card: DiscoveryCardRow): void;
}

export function DiscoveryCardTile({ card, onOpen }: DiscoveryCardTileProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (element === null) return;
    let dwellTimer: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && dwellTimer === null) {
            dwellTimer = window.setTimeout(() => {
              void useDiscoveryStore.getState().recordImpression(card.id, card.topic_label);
            }, IMPRESSION_VISIBLE_MS);
          } else if (!entry.isIntersecting && dwellTimer !== null) {
            window.clearTimeout(dwellTimer);
            dwellTimer = null;
          }
        }
      },
      { threshold: IMPRESSION_VISIBLE_THRESHOLD },
    );
    observer.observe(element);
    return () => {
      if (dwellTimer !== null) window.clearTimeout(dwellTimer);
      observer.disconnect();
    };
  }, [card.id, card.topic_label]);

  return (
    <div
      ref={containerRef}
      className="group relative rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <button
        type="button"
        onClick={() => onOpen(card)}
        className="block min-h-36 w-full p-6 text-left"
      >
        <p className="text-lg font-medium leading-snug text-stone-700">{card.title}</p>
        <p className="mt-2 text-[15px] leading-relaxed text-stone-500">{card.hook}</p>
      </button>
      <button
        type="button"
        onClick={() => void useDiscoveryStore.getState().dislikeCard(card.id, card.topic_label)}
        className="absolute top-3 right-3 hidden text-xs text-stone-400 hover:text-stone-600 group-hover:block"
      >
        不感兴趣
      </button>
    </div>
  );
}
