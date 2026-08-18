/**
 * Purpose: one discovery-feed card. Every external item (spec 053 §6, reworked by spec 054 §(b)
 * and §(d)) is built the same way top to bottom: a 16:9 picture area that is always there, a mark
 * in its corner saying what the item is and how long it takes, the source's name, a title cut off
 * at two lines, and the teaser under it. Same parts in the same places on every card is what stops
 * a feed of mixed video, articles and papers from looking ragged.
 *
 * Cards from the retired self-generated pipeline (spec 051, no source, no kind) keep the plain
 * title + hook layout they have always had: they have no picture, no source and nothing to time.
 *
 * Both carry the silent impression observer (≥50% visible for ≥1s, fires once) and the
 * hover-revealed 「不感兴趣」 control.
 *
 * No feedback receipt is drawn here for 「不感兴趣」: pressing it removes the card from the feed
 * on the spot, so there is no tile left to mark (spec 053 §6's persistent receipt has nowhere to
 * live on a card that is gone).
 * Main exports: DiscoveryCardTile.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useCallback, useEffect, useRef, useState } from "react";
import { mediaBadgeForCard } from "../lib/discoveryCardMediaBadge";
import { sourceAndAuthorLine } from "../lib/discoveryCardPresentation";
import { FEED_GRID_MAXIMUM_CARD_PX } from "../lib/discoveryFeedGrid";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { DiscoveryCardCover } from "./DiscoveryCardCover";
import { DiscoveryCardMediaBadge } from "./DiscoveryCardMediaBadge";
import { DiscoveryCoverPlaceholder } from "./DiscoveryCoverPlaceholder";
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

/** `w-full` plus the ceiling from lib/discoveryFeedGrid: the card fills its grid track until the
 * track is wider than a card should ever be, which happens on a window too narrow to fit two
 * columns. */
const TILE_SHELL =
  "group relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-md";
const TILE_STYLE = { maxWidth: `${FEED_GRID_MAXIMUM_CARD_PX}px` };

export function DiscoveryCardTile({ card, onOpen }: DiscoveryCardTileProps) {
  const containerRef = useImpressionObserver(card);
  const [coverUnavailable, setCoverUnavailable] = useState(false);
  /** Stable across renders on purpose: the cover's deadline is armed in an effect, and a fresh
   * closure here used to re-arm it on every render of the grid (spec 053 T10c). */
  const handleCoverUnavailable = useCallback(() => setCoverUnavailable(true), []);
  const external = card.source_id !== null;
  const showCover = card.cover_url !== null && !coverUnavailable;
  const sourceLine = sourceAndAuthorLine(card);
  const badge = mediaBadgeForCard(card);

  if (!external) {
    return (
      <div ref={containerRef} className={TILE_SHELL} style={TILE_STYLE}>
        <button
          type="button"
          onClick={() => onOpen(card)}
          className="flex min-h-36 flex-1 flex-col p-6 text-left"
        >
          <p className="font-medium text-lg text-stone-700 leading-snug">{card.title}</p>
          {card.hook.length > 0 && (
            <p className="mt-2 text-[15px] text-stone-500 leading-relaxed">{card.hook}</p>
          )}
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={TILE_SHELL} style={TILE_STYLE}>
      {/* The button grows to the row's height so the whole card face opens the item, and the
          strip holding 收藏 stays pinned to the bottom edge whatever the title's length. */}
      <button type="button" onClick={() => onOpen(card)} className="flex flex-1 flex-col text-left">
        <div className="relative w-full shrink-0 overflow-hidden bg-stone-100 pt-[56.25%]">
          <div className="absolute inset-0">
            {showCover && card.cover_url !== null ? (
              <DiscoveryCardCover
                coverUrl={card.cover_url}
                onUnavailable={handleCoverUnavailable}
              />
            ) : (
              <DiscoveryCoverPlaceholder kind={card.kind} />
            )}
          </div>
          {badge !== null && card.kind !== null && (
            <DiscoveryCardMediaBadge kind={card.kind} badge={badge} />
          )}
        </div>
        <div className="flex flex-1 flex-col px-4 pt-3">
          {sourceLine !== null && <p className="truncate text-stone-400 text-xs">{sourceLine}</p>}
          <p className="mt-1 line-clamp-2 font-medium text-[15px] text-stone-700 leading-snug">
            {card.title}
          </p>
          {card.hook.length > 0 && (
            <p className="mt-1.5 line-clamp-2 text-[13px] text-stone-500 leading-relaxed">
              {card.hook}
            </p>
          )}
        </div>
      </button>
      <div className="mt-auto flex justify-end px-2 pb-1.5">
        <DiscoverySaveToggle card={card} />
      </div>
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
