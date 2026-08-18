/**
 * Purpose: the discovery store's reading half — marking a card opened, and streaming or keeping an
 * article's text on the row the grid holds. Split out of discoveryStore.ts purely to keep that file
 * under the file-size ceiling (the same reason plannerStoreEvents exists), and handed the card list
 * plus a way to write one row back, so this module has no dependency on the store file.
 * Side effects: writes discovery_cards.opened_at and one open event; may fetch an article body.
 * Main exports: createDiscoveryReadingActions, DiscoveryReadingActions, DiscoveryCardsAccess,
 * StreamArticleResult.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { getRepos } from "../lib/db";
import { streamCardArticle } from "../lib/discoveryArticleActions";
import { recordDiscoveryEvent } from "../lib/discoveryFeedPaging";
import { nowIso } from "../lib/time";

export type StreamArticleResult = { ok: true; bodyMd: string } | { ok: false; reason: string };

/** The store's card list as this half needs it: read it, and change one row in it. */
export interface DiscoveryCardsAccess {
  read(): readonly DiscoveryCardRow[];
  patch(cardId: string, patch: Partial<DiscoveryCardRow>): void;
}

export interface DiscoveryReadingActions {
  /** Takes the row, not an id: an item opened from 收藏 is off the grid and still records. */
  openCard(card: DiscoveryCardRow): Promise<void>;
  streamArticle(cardId: string, onDelta: (delta: string) => void): Promise<StreamArticleResult>;
  /** Keeps the text an external article was just read from on the row the grid holds, so a second
   * open in the same session reads it from here rather than off the network again. */
  noteCardBody(cardId: string, bodyMd: string): void;
}

const CARD_IS_GONE = "这张卡片不在当前列表里了。";

export function createDiscoveryReadingActions(
  cards: DiscoveryCardsAccess,
): DiscoveryReadingActions {
  return {
    async openCard(card) {
      // The grid hands over a snapshot; the list holds the row as it stands now, and reading that
      // one back is what stops a re-open writing a second event. A 收藏 row is off the grid.
      const live = cards.read().find((one) => one.id === card.id) ?? card;
      if (live.opened_at !== null) return;
      const repos = await getRepos();
      const openedAt = nowIso();
      await repos.discovery.markOpened(card.id, openedAt);
      await recordDiscoveryEvent(card.id, card.topic_label, "open");
      cards.patch(card.id, { opened_at: openedAt });
    },

    async streamArticle(cardId, onDelta) {
      const card = cards.read().find((one) => one.id === cardId);
      if (card === undefined) return { ok: false, reason: CARD_IS_GONE };
      if (card.body_md !== null) return { ok: true, bodyMd: card.body_md };
      const outcome = await streamCardArticle(card, onDelta);
      if (outcome.kind === "blocked") return { ok: false, reason: outcome.reason };
      cards.patch(cardId, { body_md: outcome.bodyMd });
      return { ok: true, bodyMd: outcome.bodyMd };
    },

    noteCardBody(cardId, bodyMd) {
      cards.patch(cardId, { body_md: bodyMd });
    },
  };
}
