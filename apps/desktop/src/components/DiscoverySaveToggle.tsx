/**
 * Purpose: the 收藏 control, on the card and in the reader (spec 053 §6). Filled when the card is
 * already 收藏 and hollow when it is not. It is a bookmark and nothing else: this control never
 * carries a "like" meaning, and the feed has no like button at all — what the reader keeps for
 * later is a separate thing from what the reader enjoys.
 * Main exports: DiscoverySaveToggle.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { Bookmark } from "lucide-react";
import { useDiscoveryStore } from "../stores/discoveryStore";

interface DiscoverySaveToggleProps {
  card: DiscoveryCardRow;
  className?: string;
}

export function DiscoverySaveToggle({ card, className = "" }: DiscoverySaveToggleProps) {
  const saved = card.saved_at !== null;
  const label = saved ? "取消收藏" : "收藏";

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={saved}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        const store = useDiscoveryStore.getState();
        if (saved) void store.unsaveCard(card.id, card.topic_label);
        else void store.saveCard(card.id, card.topic_label);
      }}
      className={`rounded-lg p-1.5 transition-colors ${
        saved ? "text-amber-600" : "text-stone-400 hover:text-stone-600"
      } ${className}`}
    >
      <Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden={true} />
    </button>
  );
}
