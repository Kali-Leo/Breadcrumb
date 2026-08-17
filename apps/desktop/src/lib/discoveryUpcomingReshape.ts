/**
 * Purpose: what happens to the grid when the feed's dial moves (spec 053 §6, 验收 "旋钮拨动立即
 * 改变构成") — every card the reader has already had in front of them this session keeps its exact
 * position, and each position after those is re-filled from a fresh ranking under the new
 * exploration share. Nothing scrolled past ever moves, which is the same principle that stops a
 * restock from re-ordering the grid under a reader mid-scroll.
 * Side effects: reads the pool and the event stream through discoveryFeedPaging's ranking pass.
 * Main exports: reshapeUpcomingCards.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { rankUnshownPoolCards } from "./discoveryFeedPaging";

export interface ReshapedFeed {
  cards: DiscoveryCardRow[];
  pending: DiscoveryCardRow[];
}

/** `impressedIds` is the session's impression set; only its members that are still on the grid
 * hold their seats. The ranking pass is the one the feed already uses, so a re-shaped grid is
 * ordered exactly like a freshly loaded one would be at this share. */
export async function reshapeUpcomingCards(
  cards: readonly DiscoveryCardRow[],
  impressedIds: ReadonlySet<string>,
  explorationShare: number,
): Promise<ReshapedFeed> {
  const keptIds = new Set(cards.filter((card) => impressedIds.has(card.id)).map((card) => card.id));
  const upcoming = await rankUnshownPoolCards(keptIds, explorationShare);
  const reshaped = cards
    .map((card) => (keptIds.has(card.id) ? card : upcoming.shift()))
    .filter((card) => card !== undefined);
  return { cards: reshaped, pending: upcoming };
}
