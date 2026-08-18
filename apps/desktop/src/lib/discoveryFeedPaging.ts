/**
 * Purpose: the two mechanical jobs behind the feed's grid, kept out of the store — reading the
 * local pool and ranking whatever the reader has not been shown yet, and moving a page of those
 * onto the grid without ever showing the same card twice. Plus the one-line event writer every
 * silent signal goes through.
 * Side effects: reads the pool and the event stream; writes one discovery_events row.
 * Main exports: rankUnshownPoolCards, takeNextPage, recordDiscoveryEvent.
 */
import type { DiscoveryCardRow, DiscoveryEventKind } from "@breadcrumb/core-db";
import { defaultFeedPageSize } from "@breadcrumb/plugin-discovery";
import {
  ensureFeedLanguagePolicyLoaded,
  ensureFeedModePolicyLoaded,
} from "../stores/discoveryChannelSettingsStore";
import { getRepos } from "./db";
import { cardPassesModeFilter } from "./discoveryFeedMode";
import { cardPassesLanguageFilter } from "./discoveryLanguageFilter";
import { orderCardsForDisplay } from "./discoveryOrdering";
import { UNSEEN_POOL_CAP } from "./discoveryPoolPruning";
import { newId, nowIso } from "./time";

/** Cards handed to the grid at a time — and the page the ranking's quotas are enforced over. */
export const FEED_PAGE_SIZE = defaultFeedPageSize;

/** Ranks every pooled card the reader has not opened and is not already looking at. Cards on
 * screen are left where they are: re-ordering under a reader mid-scroll would move what they
 * were about to click. The read covers the whole unseen pool — the pool is capped, and ranking
 * only the newest slice of it would mean the ranking never chooses, it only re-orders whatever
 * arrived last.
 *
 * The language check happens here rather than at landing (spec 054): the pool keeps whatever it
 * caught, so switching another language on in the language settings makes cards already sitting
 * there appear, with nothing to re-fetch and nothing lost in the meantime. The 休闲/专业 check is
 * here for the same reason and in the same spirit — a mood the reader changes twice an evening must
 * never cost them cards that were already fetched. 收藏 is read by another path and stays
 * unfiltered — a saved card was saved on purpose. */
export async function rankUnshownPoolCards(
  shownIds: ReadonlySet<string>,
  explorationShare: number,
): Promise<DiscoveryCardRow[]> {
  const repos = await getRepos();
  const [pool, events, languagePolicy, modePolicy] = await Promise.all([
    repos.discovery.listUnseenPoolCards(UNSEEN_POOL_CAP),
    repos.discovery.listAllEvents(),
    ensureFeedLanguagePolicyLoaded(),
    ensureFeedModePolicyLoaded(),
  ]);
  const fresh = pool.filter(
    (card) =>
      !shownIds.has(card.id) &&
      cardPassesLanguageFilter(card, languagePolicy) &&
      cardPassesModeFilter(card, modePolicy),
  );
  return orderCardsForDisplay(fresh, events, nowIso(), {
    explorationShare,
    pageSize: FEED_PAGE_SIZE,
  });
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
