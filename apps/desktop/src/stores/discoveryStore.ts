/**
 * Purpose: zustand store for the discovery feed (spec 051, spec 053) — hands the grid one page
 * at a time out of the local card pool and keeps that pool stocked behind the reader
 * (lib/discoveryRefill). Cards come from external channels now; nothing on the display path
 * waits on the network, on an embedding or on an LLM. The silent signal actions
 * (impression/open/dwell/save/finish/dislike) write into discovery_events; the dial re-ranks
 * what the reader has not reached. Article streaming is a pass-through for retired card pools.
 * Main exports: useDiscoveryStore.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { streamCardArticle } from "../lib/discoveryArticleActions";
import {
  FEED_PAGE_SIZE,
  rankUnshownPoolCards,
  recordDiscoveryEvent,
  takeNextPage,
} from "../lib/discoveryFeedPaging";
import type { RefillOptions, RefillOutcome } from "../lib/discoveryRefill";
import { restockBehindTheGrid, runRefill } from "../lib/discoveryRestockTask";
import { reshapeUpcomingCards } from "../lib/discoveryUpcomingReshape";
import { nowIso } from "../lib/time";
import { useSettingsStore } from "./settingsStore";

export type StreamArticleResult = { ok: true; bodyMd: string } | { ok: false; reason: string };

interface DiscoveryState {
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
  /** Re-ranks the not-yet-reached part of the grid, for when the dial moves (spec 053 §6). */
  reshapeUpcoming(): Promise<void>;
  /** Takes the row, not an id: an item opened from 收藏 is off the grid and still records. */
  openCard(card: DiscoveryCardRow): Promise<void>;
  streamArticle(cardId: string, onDelta: (delta: string) => void): Promise<StreamArticleResult>;
  /** Keeps the text an external article was just read from on the row the grid holds, so a
   * second open in the same session reads it from here rather than off the network again. */
  noteCardBody(cardId: string, bodyMd: string): void;
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
      const taken = takePage(FEED_PAGE_SIZE);
      if (taken >= FEED_PAGE_SIZE) {
        restockBehindTheGrid(stagePending);
        return;
      }
      set({ loading: true, blockedReason: null });
      const outcome = await runRefill({ force: true });
      await stagePending();
      takePage(FEED_PAGE_SIZE - taken);
      set({ loading: false, blockedReason: bannerFor(outcome) });
    },

    async reshapeUpcoming() {
      const share = useSettingsStore.getState().discoveryExplorationShare;
      set(await reshapeUpcomingCards(get().cards, get().sessionImpressedIds, share));
    },

    async openCard(card) {
      // The grid hands over a snapshot; the store holds the row as it stands now, and reading
      // that one back is what stops a re-open writing a second event. A 收藏 row is off the grid.
      const live = get().cards.find((c) => c.id === card.id) ?? card;
      if (live.opened_at !== null) return;
      const repos = await getRepos();
      const openedAt = nowIso();
      await repos.discovery.markOpened(card.id, openedAt);
      await recordDiscoveryEvent(card.id, card.topic_label, "open");
      set({
        cards: get().cards.map((c) => (c.id === card.id ? { ...c, opened_at: openedAt } : c)),
      });
    },

    async streamArticle(cardId, onDelta) {
      const card = get().cards.find((c) => c.id === cardId);
      if (card === undefined) return { ok: false, reason: "这张卡片不在当前列表里了。" };
      if (card.body_md !== null) return { ok: true, bodyMd: card.body_md };
      const outcome = await streamCardArticle(card, onDelta);
      if (outcome.kind === "blocked") return { ok: false, reason: outcome.reason };
      set({
        cards: get().cards.map((c) => (c.id === cardId ? { ...c, body_md: outcome.bodyMd } : c)),
      });
      return { ok: true, bodyMd: outcome.bodyMd };
    },

    noteCardBody(cardId, bodyMd) {
      set({
        cards: get().cards.map((c) => (c.id === cardId ? { ...c, body_md: bodyMd } : c)),
      });
    },

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
