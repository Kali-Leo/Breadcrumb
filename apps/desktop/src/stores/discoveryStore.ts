/**
 * Purpose: zustand store for the discovery feed (spec 051) — display-ordered cards, batch
 * generation state (loading + a plain blocked-reason banner), per-session impression dedup,
 * and the silent signal-recording actions (open/impression/dwell/dislike) that write into
 * discovery_events. Article streaming is a thin pass-through to lib/discoveryArticleActions;
 * the growing text itself lives in the overlay component's own state, not here.
 * Main exports: useDiscoveryStore.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { generateBatch } from "../lib/discoveryActions";
import { streamCardArticle } from "../lib/discoveryArticleActions";
import { orderCardsForDisplay } from "../lib/discoveryOrdering";
import { newId, nowIso } from "../lib/time";

export type StreamArticleResult = { ok: true; bodyMd: string } | { ok: false; reason: string };

interface DiscoveryState {
  cards: DiscoveryCardRow[];
  loading: boolean;
  /** Plain-language reason the last generation attempt produced nothing — null once a batch
   * has landed since, so a stale banner never lingers over a fresh, full grid. */
  blockedReason: string | null;
  sessionImpressedIds: Set<string>;
  loadInitial(): Promise<void>;
  /** Called once at app start (Leo's order): if fewer than a batch of unseen cards is
   * waiting, generate one in the background so the page opens already filled. */
  ensureWarm(): Promise<void>;
  loadMore(): Promise<void>;
  openCard(cardId: string): Promise<void>;
  streamArticle(cardId: string, onDelta: (delta: string) => void): Promise<StreamArticleResult>;
  recordImpression(cardId: string, topicLabel: string): Promise<void>;
  recordDwell(cardId: string, topicLabel: string, ms: number): Promise<void>;
  dislikeCard(cardId: string, topicLabel: string): Promise<void>;
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  cards: [],
  loading: false,
  blockedReason: null,
  sessionImpressedIds: new Set(),

  async ensureWarm() {
    if (get().loading) return;
    const repos = await getRepos();
    const [cards, events] = await Promise.all([
      repos.discovery.listNewestCards(60),
      repos.discovery.listAllEvents(),
    ]);
    const consumedIds = new Set(
      events
        .filter((event) => event.kind === "dislike" || event.kind === "open")
        .map((event) => event.card_id),
    );
    const unseen = cards.filter((card) => !consumedIds.has(card.id)).length;
    if (unseen >= 12) return;
    set({ loading: true });
    await generateBatch();
    set({ loading: false });
  },

  async loadInitial() {
    if (get().loading) return; // StrictMode double-mount fires this twice concurrently
    set({ loading: true, blockedReason: null });
    const repos = await getRepos();
    const existing = await repos.discovery.listNewestCards(60);
    if (existing.length > 0) {
      const events = await repos.discovery.listAllEvents();
      set({ cards: orderCardsForDisplay(existing, events, nowIso()), loading: false });
      return;
    }
    const outcome = await generateBatch();
    if (outcome.kind === "blocked") {
      set({ loading: false, blockedReason: outcome.reason });
      return;
    }
    const events = await repos.discovery.listAllEvents();
    set({ cards: orderCardsForDisplay(outcome.cards, events, nowIso()), loading: false });
  },

  async loadMore() {
    if (get().loading) return; // guard re-entry (scroll sentinel firing twice)
    set({ loading: true, blockedReason: null });
    const outcome = await generateBatch();
    if (outcome.kind === "blocked") {
      set({ loading: false, blockedReason: outcome.reason });
      return;
    }
    const repos = await getRepos();
    const events = await repos.discovery.listAllEvents();
    // Only the new batch is re-ranked and appended — reordering the whole list on every
    // scroll-triggered append would reshuffle cards the reader has already scrolled past.
    const orderedNew = orderCardsForDisplay(outcome.cards, events, nowIso());
    set({ cards: [...get().cards, ...orderedNew], loading: false });
  },

  async openCard(cardId) {
    const card = get().cards.find((c) => c.id === cardId);
    if (card === undefined || card.opened_at !== null) return;
    const repos = await getRepos();
    const openedAt = nowIso();
    await repos.discovery.markOpened(cardId, openedAt);
    await repos.discovery.insertEvent({
      id: newId(),
      card_id: cardId,
      topic_label: card.topic_label,
      kind: "open",
      value_ms: null,
      created_at: openedAt,
    });
    set({
      cards: get().cards.map((c) => (c.id === cardId ? { ...c, opened_at: openedAt } : c)),
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

  async recordImpression(cardId, topicLabel) {
    if (get().sessionImpressedIds.has(cardId)) return;
    const nextSeen = new Set(get().sessionImpressedIds);
    nextSeen.add(cardId);
    set({ sessionImpressedIds: nextSeen });
    const repos = await getRepos();
    await repos.discovery.insertEvent({
      id: newId(),
      card_id: cardId,
      topic_label: topicLabel,
      kind: "impression",
      value_ms: null,
      created_at: nowIso(),
    });
  },

  async recordDwell(cardId, topicLabel, ms) {
    if (ms <= 0) return;
    const repos = await getRepos();
    await repos.discovery.insertEvent({
      id: newId(),
      card_id: cardId,
      topic_label: topicLabel,
      kind: "dwell",
      value_ms: Math.round(ms),
      created_at: nowIso(),
    });
  },

  async dislikeCard(cardId, topicLabel) {
    set({ cards: get().cards.filter((c) => c.id !== cardId) });
    const repos = await getRepos();
    await repos.discovery.insertEvent({
      id: newId(),
      card_id: cardId,
      topic_label: topicLabel,
      kind: "dislike",
      value_ms: null,
      created_at: nowIso(),
    });
  },
}));
