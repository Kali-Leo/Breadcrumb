/**
 * Purpose: the mark in the corner of a card's picture (spec 054 §(d)) — an icon for what the item
 * is, and next to it either how long it runs or, for a text, about how long it takes to read.
 *
 * Two texts, one for the eye and one for a screen reader, and the printed one is hidden from
 * assistive software rather than read out. Placed over a picture, so it sits on a translucent dark
 * panel: M3 asks for "a translucent scrim or bounding shape beneath the text or icon", and
 * bilibili's own duration mark is exactly that — 4px in from the bottom-right corner, black at 40%,
 * 2px corners.
 * Main exports: DiscoveryCardMediaBadge.
 */
import type { DiscoveryCardKind } from "@breadcrumb/core-db";
import type { CardMediaBadge } from "../lib/discoveryCardMediaBadge";
import { DiscoveryKindIcon } from "./DiscoveryKindIcon";

interface DiscoveryCardMediaBadgeProps {
  kind: DiscoveryCardKind;
  badge: CardMediaBadge;
}

export function DiscoveryCardMediaBadge({ kind, badge }: DiscoveryCardMediaBadgeProps) {
  return (
    <>
      <span
        aria-hidden={true}
        data-testid="discovery-media-badge"
        className="absolute right-1 bottom-1 flex items-center gap-1 rounded-[2px] bg-black/40 px-1.5 py-0.5 text-[11px] text-white leading-none"
      >
        <DiscoveryKindIcon kind={kind} className="size-3" decorative={true} />
        {badge.visual}
      </span>
      <span className="sr-only">{badge.spoken}</span>
    </>
  );
}
