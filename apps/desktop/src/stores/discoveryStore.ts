/**
 * Purpose: zustand store for the discovery feed (spec 051, spec 053) — hands the grid one page
 * at a time out of the local card pool and keeps that pool stocked behind the reader
 * (lib/discoveryRefill). Cards come from external channels now; nothing on the display path
 * waits on the network, on an embedding or on an LLM. The silent signal actions
 * (impression/dwell/save/finish/dislike) write into discovery_events; the three controls on the
 * feed page redraw the grid (spec 054). Opening a card and reading its text live in
 * discoveryStoreReading.
 * Main exports: useDiscoveryStore.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import {
  FEED_PAGE_SIZE,
  rankUnshownPoolCards,
  recordDiscoveryEvent,
  takeNextPage,
} from "../lib/discoveryFeedPaging";
import { scrollDiscoveryFeedToTop } from "../lib/discoveryFeedScroll";
import type { RefillOptions, RefillOutcome } from "../lib/discoveryRefill";
import { restockBehindTheGrid, runRefill } from "../lib/discoveryRestockTask";
import { reshapeUpcomingCards } from "../lib/discoveryUpcomingReshape";
import { nowIso } from "../lib/time";
import {
  createDiscoveryReadingActions,
  type DiscoveryReadingActions,
} from "./discoveryStoreReading";
import { useSettingsStore } from "./settingsStore";

export type { StreamArticleResult } from "./discoveryStoreReading";

interface DiscoveryState extends DiscoveryReadingActions {
  cards: DiscoveryCardRow[];
  /** Ordered pool cards not on screen yet — the next pages, already ranked. */
  pending: DiscoveryCardRow[];
  loading: boolean;
  /** Plain-language line for an empty feed, set only when the pool holds nothing AND nothing
   * could be fetched. A grid with cards in it never shows a banner. */
  blockedReason: string | null;
  sessionImpressedIds: Set<string>;
  loadInitial(): Promise<void>;
  /** Called once at app start (Leo's order): restocks the pool in the background so the page
   * opens already filled. The first-run panel calls it with forceRecall — the reader has just
   * said what they want to see, and a stocked pool would keep the app from going to look. */
  refillPool(options?: RefillOptions): Promise<void>;
  loadMore(): Promise<void>;
  /** Re-ranks the not-yet-reached part of the grid, for a setting changed on another page while
   * the feed is not in front of the reader (spec 053 §6). */
  reshapeUpcoming(): Promise<void>;
  /** Replaces what the grid is showing, for the three controls on the feed page itself: the
   * familiar/new dial, the 休闲/专业 mode and the 学术内容 switch (spec 054, Leo's fifth point —
   * 「整流换掉」). */
  redrawFeed(): Promise<void>;
  recordImpression(cardId: string, topicLabel: string): Promise<void>;
  recordDwell(cardId: string, topicLabel: string, ms: number): Promise<void>;
  recordFinish(cardId: string, topicLabel: string): Promise<void>;
  saveCard(cardId: string, topicLabel: string): Promise<void>;
  unsaveCard(cardId: string, topicLabel: string): Promise<void>;
  dislikeCard(cardId: string, topicLabel: string): Promise<void>;
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => {
  const stagePending = async (): Promise<void> => {
    const shownIds = new Set(get().cards.map((card) => card.id));
    const share = useSettingsStore.getState().discoveryExplorationShare;
    set({ pending: await rankUnshownPoolCards(shownIds, share) });
  };

  const takePage = (count: number): number => {
    const page = takeNextPage(get().cards, get().pending, count);
    set({ cards: page.cards, pending: page.pending });
    return page.taken;
  };

  /** A banner only when the feed is genuinely empty — a full grid with a failed restock behind
   * it says nothing, because nothing is missing from the reader's side. */
  const bannerFor = (outcome: RefillOutcome): string | null =>
    get().cards.length === 0 ? outcome.reason : null;

  const readingActions = createDiscoveryReadingActions({
    read: () => get().cards,
    patch: (cardId, patch) => {
      set({ cards: get().cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) });
    },
  });

  /** Draws the next `count` cards onto the grid, going to the network only when the pool comes
   * up short of them. Shared by the scroll sentinel and by a redraw, which want the same thing. */
  const fillGrid = async (count: number): Promise<void> => {
    const taken = takePage(count);
    if (taken >= count) {
      set({ loading: false });
      restockBehindTheGrid(stagePending);
      return;
    }
    set({ loading: true, blockedReason: null });
    const outcome = await runRefill({ force: true });
    await stagePending();
    takePage(count - taken);
    set({ loading: false, blockedReason: bannerFor(outcome) });
  };

  return {
    cards: [],
    pending: [],
    loading: false,
    blockedReason: null,
    sessionImpressedIds: new Set(),

    async refillPool(options) {
      const outcome = await runRefill(options);
      if (outcome.kind === "unavailable") return; // silent: nobody has opened the feed yet
      await stagePending();
    },

    async loadInitial() {
      if (get().cards.length > 0) return;
      set({ loading: true, blockedReason: null });
      await stagePending();
      if (takePage(FEED_PAGE_SIZE) > 0) {
        set({ loading: false });
        restockBehindTheGrid(stagePending);
        return;
      }
      const outcome = await runRefill();
      await stagePending();
      takePage(FEED_PAGE_SIZE);
      set({ loading: false, blockedReason: bannerFor(outcome) });
    },

    async loadMore() {
      if (get().loading) return; // guard re-entry (scroll sentinel firing twice)
      await fillGrid(FEED_PAGE_SIZE);
    },

    async reshapeUpcoming() {
      const share = useSettingsStore.getState().discoveryExplorationShare;
      set(await reshapeUpcomingCards(get().cards, get().sessionImpressedIds, share));
    },

    /**
     * The reader changed what the feed should be showing while looking at it, so the feed shows
     * something else: the grid is emptied, the page goes back to the top, and a fresh first page
     * is drawn from the pool under the new setting — with a fetch behind it when the pool cannot
     * fill one. Nothing is deleted: the pool keeps every card, 收藏 and the opened ones are
     * untouched, and a card that no longer fits the setting is simply not drawn this time.
     * Losing the reader's place is the accepted cost of Leo's 「整流换掉」, and it is why this
     * happens only on a control they just touched themselves.
     */
    async redrawFeed() {
      scrollDiscoveryFeedToTop();
      set({ cards: [], pending: [], loading: true, blockedReason: null });
      await stagePending();
      await fillGrid(FEED_PAGE_SIZE);
    },

    ...readingActions,

    async recordImpression(cardId, topicLabel) {
      if (get().sessionImpressedIds.has(cardId)) return;
      const nextSeen = new Set(get().sessionImpressedIds);
      nextSeen.add(cardId);
      set({ sessionImpressedIds: nextSeen });
      await recordDiscoveryEvent(cardId, topicLabel, "impression");
    },

    async recordDwell(cardId, topicLabel, ms) {
      // A NaN or Infinity duration (a timer started before a clock jump, a subtraction against an
      // unset start) passes a plain `<= 0` test and lands in the row as NULL, which reads back as
      // a dwell that says nothing. Only a real duration is worth recording.
      if (!Number.isFinite(ms) || ms <= 0) return;
      await recordDiscoveryEvent(cardId, topicLabel, "dwell", Math.round(ms));
    },

    async recordFinish(cardId, topicLabel) {
      await recordDiscoveryEvent(cardId, topicLabel, "finish");
    },

    async saveCard(cardId, topicLabel) {
      const savedAt = nowIso();
      const repos = await getRepos();
      await repos.discovery.markSaved(cardId, savedAt);
      set({ cards: get().cards.map((c) => (c.id === cardId ? { ...c, saved_at: savedAt } : c)) });
      await recordDiscoveryEvent(cardId, topicLabel, "save");
    },

    async unsaveCard(cardId, topicLabel) {
      const repos = await getRepos();
      await repos.discovery.markSaved(cardId, null);
      set({ cards: get().cards.map((c) => (c.id === cardId ? { ...c, saved_at: null } : c)) });
      await recordDiscoveryEvent(cardId, topicLabel, "unsave");
    },

    async dislikeCard(cardId, topicLabel) {
      set({
        cards: get().cards.filter((c) => c.id !== cardId),
        pending: get().pending.filter((c) => c.id !== cardId),
      });
      await recordDiscoveryEvent(cardId, topicLabel, "dislike");
    },
  };
});
