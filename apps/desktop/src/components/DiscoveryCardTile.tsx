/**
 * Purpose: one discovery-feed card. External items (spec 053 §6) show their real cover picture,
 * their title, and a quiet line naming what they are and where they come from, plus a 收藏
 * toggle. Cards from the retired self-generated pipeline (spec 051, no source) keep the plain
 * title + hook layout they have always had. Both carry the silent impression observer (≥50%
 * visible for ≥1s, fires once) and the hover-revealed 「不感兴趣」 control.
 *
 * No feedback receipt is drawn here for 「不感兴趣」: pressing it removes the card from the feed
 * on the spot, so there is no tile left to mark (spec 053 §6's persistent receipt has nowhere to
 * live on a card that is gone).
 * Main exports: DiscoveryCardTile.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useEffect, useRef, useState } from "react";
import { sourceAndAuthorLine } from "../lib/discoveryCardPresentation";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { DiscoveryCardCover } from "./DiscoveryCardCover";
import { DiscoveryKindIcon } from "./DiscoveryKindIcon";
import { DiscoverySaveToggle } from "./DiscoverySaveToggle";

const IMPRESSION_VISIBLE_MS = 1000;
const IMPRESSION_VISIBLE_THRESHOLD = 0.5;

interface DiscoveryCardTileProps {
  card: DiscoveryCardRow;
  onOpen(card: DiscoveryCardRow): void;
}

function useImpressionObserver(card: DiscoveryCardRow) {
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

  return containerRef;
}

export function DiscoveryCardTile({ card, onOpen }: DiscoveryCardTileProps) {
  const containerRef = useImpressionObserver(card);
  const [coverUnavailable, setCoverUnavailable] = useState(false);
  const external = card.source_id !== null;
  const showCover = external && card.cover_url !== null && !coverUnavailable;
  const sourceLine = sourceAndAuthorLine(card);

  return (
    <div
      ref={containerRef}
      className="group relative overflow-hidden rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <button
        type="button"
        onClick={() => onOpen(card)}
        className={
          external ? "block w-full pb-10 text-left" : "block min-h-36 w-full p-6 text-left"
        }
      >
        {showCover && card.cover_url !== null && (
          <DiscoveryCardCover
            coverUrl={card.cover_url}
            onUnavailable={() => setCoverUnavailable(true)}
          />
        )}
        <div className={external ? (showCover ? "px-5 pt-4" : "px-6 pt-6") : ""}>
          <p
            className={`font-medium leading-snug text-stone-700 ${
              external ? `line-clamp-3 ${showCover ? "text-[17px]" : "text-xl"}` : "text-lg"
            }`}
          >
            {card.title}
          </p>
          {card.hook.length > 0 && (
            <p
              className={`mt-2 text-[15px] leading-relaxed text-stone-500 ${
                external ? "line-clamp-2" : ""
              }`}
            >
              {card.hook}
            </p>
          )}
        </div>
      </button>
      {external && (sourceLine !== null || card.kind !== null) && (
        <div
          className={`pointer-events-none absolute right-12 bottom-3 flex items-center gap-1.5 text-stone-400 text-xs ${
            showCover ? "left-5" : "left-6"
          }`}
        >
          <DiscoveryKindIcon kind={card.kind} />
          {sourceLine !== null && <span className="truncate">{sourceLine}</span>}
        </div>
      )}
      {external && <DiscoverySaveToggle card={card} className="absolute right-3 bottom-2" />}
      <button
        type="button"
        onClick={() => void useDiscoveryStore.getState().dislikeCard(card.id, card.topic_label)}
        className="absolute top-3 right-3 hidden rounded-lg bg-white/90 px-2 py-1 text-stone-400 text-xs hover:text-stone-600 group-hover:block"
      >
        不感兴趣
      </button>
    </div>
  );
}
