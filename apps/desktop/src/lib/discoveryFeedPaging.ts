/**
 * Purpose: the two mechanical jobs behind the feed's grid, kept out of the store — reading the
 * local pool and ranking whatever the reader has not been shown yet, and moving a page of those
 * onto the grid without ever showing the same card twice. Plus the one-line event writer every
 * silent signal goes through.
 * Side effects: reads the pool and the event stream; writes one discovery_events row.
 * Main exports: rankUnshownPoolCards, takeNextPage, recordDiscoveryEvent.
 */
import type { DiscoveryCardRow, DiscoveryEventKind } from "@breadcrumb/core-db";
import { getRepos } from "./db";
import { orderCardsForDisplay } from "./discoveryOrdering";
import { newId, nowIso } from "./time";

/** How much of the pool one ordering pass considers. The pool is capped around a hundred
 * cards, so this covers it with room for what the reader has already read. */
const POOL_READ_LIMIT = 200;

/** Cards handed to the grid at a time. */
export const FEED_PAGE_SIZE = 24;

/** Ranks every pooled card that is not already on the grid. Cards on screen are left where they
 * are: re-ordering under a reader mid-scroll would move what they were about to click. */
export async function rankUnshownPoolCards(
  shownIds: ReadonlySet<string>,
  explorationShare: number,
): Promise<DiscoveryCardRow[]> {
  const repos = await getRepos();
  const [pool, events] = await Promise.all([
    repos.discovery.listNewestCards(POOL_READ_LIMIT),
    repos.discovery.listAllEvents(),
  ]);
  const fresh = pool.filter((card) => !shownIds.has(card.id));
  return orderCardsForDisplay(fresh, events, nowIso(), { explorationShare });
}

export interface FeedPage {
  cards: DiscoveryCardRow[];
  pending: DiscoveryCardRow[];
  taken: number;
}

/** Moves up to `count` ranked cards onto the grid. Anything already displayed is dropped from
 * the queue rather than shown again, which is what makes a second landing of the same restock
 * a no-op. */
export function takeNextPage(
  cards: readonly DiscoveryCardRow[],
  pending: readonly DiscoveryCardRow[],
  count: number,
): FeedPage {
  const seenIds = new Set(cards.map((card) => card.id));
  const queue: DiscoveryCardRow[] = [];
  for (const card of pending) {
    if (seenIds.has(card.id)) continue;
    seenIds.add(card.id);
    queue.push(card);
  }
  const next = queue.slice(0, Math.max(0, count));
  return { cards: [...cards, ...next], pending: queue.slice(next.length), taken: next.length };
}

export async function recordDiscoveryEvent(
  cardId: string,
  topicLabel: string,
  kind: DiscoveryEventKind,
  valueMs: number | null = null,
): Promise<void> {
  const repos = await getRepos();
  await repos.discovery.insertEvent({
    id: newId(),
    card_id: cardId,
    topic_label: topicLabel,
    kind,
    value_ms: valueMs,
    created_at: nowIso(),
  });
}
