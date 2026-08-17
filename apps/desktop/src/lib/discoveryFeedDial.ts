/**
 * Purpose: the two positions of the feed's 熟悉的多一点｜新领域多一点 switch (spec 053 §6) and the
 * share of the feed each one hands to territory the reader has no history with. Pure mapping, so
 * the switch component only has to say which side was pressed.
 * Main exports: FeedDialPosition, feedDialShares, dialPositionForShare, shareForDialPosition.
 */

export type FeedDialPosition = "familiar" | "new-fields";

/**
 * Both stay inside explorationShareBounds (0.1–0.5, plugin-discovery): the feed never stops
 * exploring and never spends more than half the page on the unfamiliar. 0.15 is barely above the
 * floor, 0.4 is well short of the ceiling — this is a lean, not an on/off.
 */
export const feedDialShares: Readonly<Record<FeedDialPosition, number>> = {
  familiar: 0.15,
  "new-fields": 0.4,
};

/** Midpoint of the two positions. A stored share below it reads as the familiar side, which is
 * where the untouched default (0.25) lands — a reader who never pressed anything sees the switch
 * on 熟悉的多一点 rather than on a position they never chose. */
const FAMILIAR_CEILING = (feedDialShares.familiar + feedDialShares["new-fields"]) / 2;

export function dialPositionForShare(share: number): FeedDialPosition {
  if (!Number.isFinite(share)) return "familiar";
  return share < FAMILIAR_CEILING ? "familiar" : "new-fields";
}

export function shareForDialPosition(position: FeedDialPosition): number {
  return feedDialShares[position];
}
