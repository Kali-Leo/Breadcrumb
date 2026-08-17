/**
 * Purpose: unit tests for orderCardsForDisplay — cards without an embedding fall back to pure
 * recency, embedded cards score against per-card-topic-weighted centroids and get MMR-
 * reranked, and unembedded cards always land after the ranked set regardless of recency.
 */
import type { DiscoveryCardRow, DiscoveryEventRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { orderCardsForDisplay } from "./discoveryOrdering";

const NOW = "2026-08-16T00:00:00.000Z";

function card(overrides: Partial<DiscoveryCardRow> & { id: string }): DiscoveryCardRow {
  return {
    title: `title-${overrides.id}`,
    hook: "hook",
    topic_label: "topic",
    source: "starter",
    body_md: null,
    embedding_json: null,
    batch_id: "batch",
    created_at: "2026-08-15T00:00:00.000Z",
    opened_at: null,
    source_id: null,
    kind: null,
    url: null,
    cover_url: null,
    author: null,
    published_at: null,
    saved_at: null,
    quality_score: null,
    ...overrides,
  };
}

describe("orderCardsForDisplay", () => {
  it("falls back to pure recency when nothing has an embedding yet", () => {
    const cards = [
      card({ id: "old", created_at: "2026-08-14T00:00:00.000Z" }),
      card({ id: "new", created_at: "2026-08-15T12:00:00.000Z" }),
    ];
    const ordered = orderCardsForDisplay(cards, [], NOW);
    expect(ordered.map((c) => c.id)).toEqual(["new", "old"]);
  });

  it("ranks embedded cards toward the topic the reader opened, over an unrelated one", () => {
    const cards = [
      card({ id: "astronomy", topic_label: "天文学", embedding_json: JSON.stringify([1, 0]) }),
      card({ id: "cooking", topic_label: "烹饪", embedding_json: JSON.stringify([0, 1]) }),
    ];
    const events: DiscoveryEventRow[] = [
      {
        id: "e1",
        card_id: "prior-astronomy-card",
        topic_label: "天文学",
        kind: "open",
        value_ms: null,
        created_at: "2026-08-15T00:00:00.000Z",
      },
    ];
    const ordered = orderCardsForDisplay(cards, events, NOW);
    expect(ordered[0]?.id).toBe("astronomy");
  });

  it("always places unembedded cards after the ranked embedded set", () => {
    const cards = [
      card({ id: "fresh-unembedded", created_at: "2026-08-16T00:00:00.000Z" }),
      card({ id: "embedded", embedding_json: JSON.stringify([1, 0]) }),
    ];
    const ordered = orderCardsForDisplay(cards, [], NOW);
    expect(ordered.map((c) => c.id)).toEqual(["embedded", "fresh-unembedded"]);
  });
});
