/**
 * Purpose: the full-screen layer one discovery item opens into (spec 053 §7). It owns the parts
 * every item shares — marking the card opened, the header, and recording how long the item was
 * open — and hands the middle over to whichever pane the item calls for: the publisher's video
 * player, an audio player, or the reading pane. ScreenOverlay opens it as a modal dialog over the
 * window, which is where Escape, focus and the dialog role come from. Nothing in here leads to
 * another item: reaching one goes back through the feed (Apple HIG, spec 054 §a).
 * Main exports: DiscoveryReaderOverlay.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useEffect, useRef } from "react";
import { readerModeForCard } from "../lib/discoveryCardPresentation";
import { videoEmbedForUrl } from "../lib/discoveryVideoEmbeds";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { DiscoveryArticleBody } from "./DiscoveryArticleBody";
import { DiscoveryGeneratedArticleBody } from "./DiscoveryGeneratedArticleBody";
import { DiscoveryPodcastPlayer } from "./DiscoveryPodcastPlayer";
import { DiscoveryReaderHeader } from "./DiscoveryReaderHeader";
import { DiscoveryVideoPlayer } from "./DiscoveryVideoPlayer";
import { ScreenOverlay } from "./ScreenOverlay";

interface DiscoveryReaderOverlayProps {
  card: DiscoveryCardRow;
  onClose(): void;
}

function ReaderBody({ card }: { card: DiscoveryCardRow }) {
  const mode = readerModeForCard(card);
  if (mode === "generated") return <DiscoveryGeneratedArticleBody card={card} />;
  if (mode === "podcast") return <DiscoveryPodcastPlayer card={card} />;
  if (mode === "video") {
    const embed = videoEmbedForUrl(card.url);
    // readerModeForCard only answers "video" when the link resolves to an embed, so this branch
    // is here for the type, not for a case that happens.
    if (embed !== null) return <DiscoveryVideoPlayer embed={embed} />;
  }
  return <DiscoveryArticleBody card={card} />;
}

export function DiscoveryReaderOverlay({ card, onClose }: DiscoveryReaderOverlayProps) {
  // The feed hands over a snapshot; the store keeps the live row. Reading the live one back means
  // 收藏 pressed in here shows as 收藏 in here, without the feed having to pass anything down.
  const liveCard = useDiscoveryStore((state) => state.cards.find((one) => one.id === card.id));
  const shownCard = liveCard ?? card;
  const openedAtRef = useRef<number>(Date.now());

  // Keyed on card.id only — this effect owns one card's open/dwell lifecycle.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reruns only when a different card opens
  useEffect(() => {
    openedAtRef.current = Date.now();
    void useDiscoveryStore.getState().openCard(card);
    return () => {
      const dwellMs = Date.now() - openedAtRef.current;
      void useDiscoveryStore.getState().recordDwell(card.id, card.topic_label, dwellMs);
    };
  }, [card.id]);

  return (
    <ScreenOverlay label={shownCard.title} onClose={onClose}>
      <DiscoveryReaderHeader card={shownCard} onClose={onClose} />
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-2xl px-6 py-6">
          <ReaderBody card={shownCard} />
        </div>
      </div>
    </ScreenOverlay>
  );
}
