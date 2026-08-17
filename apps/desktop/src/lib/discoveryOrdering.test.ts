/**
 * Purpose: unit tests for orderCardsForDisplay — the interest signals it now folds (saves and
 * finishes count, dial moves do not), the item's own features (a low quality score demotes but
 * never hides, a real cover and freshness lift), the channel and content-form quotas, the
 * guaranteed exploration share, and the rule that a card with no embedding yet is ranked with
 * everything else instead of being pushed to the end.
 */
import type { DiscoveryCardRow, DiscoveryEventRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { discoveryRowsToInterestEvents, orderCardsForDisplay } from "./discoveryOrdering";

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
    upstream_signal: null,
    media_url: null,
    ...overrides,
  };
}

function event(overrides: Partial<DiscoveryEventRow> & { id: string }): DiscoveryEventRow {
  return {
    card_id: "some-card",
    topic_label: "topic",
    kind: "open",
    value_ms: null,
    created_at: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("discoveryRowsToInterestEvents", () => {
  it("folds saves, finishes and first-run stances in, and leaves dial moves out", () => {
    const events = discoveryRowsToInterestEvents([
      event({ id: "e1", kind: "save" }),
      event({ id: "e2", kind: "finish" }),
      event({ id: "e3", kind: "onboarding", value_ms: 1 }),
      event({ id: "e4", kind: "dial", value_ms: 40 }),
    ]);
    expect(events.map((entry) => entry.kind)).toEqual(["save", "finish", "onboarding"]);
  });
});

describe("orderCardsForDisplay", () => {
  it("ranks embedded cards toward the topic the reader opened, over an unrelated one", () => {
    const cards = [
      card({ id: "astronomy", topic_label: "天文学", embedding_json: JSON.stringify([1, 0]) }),
      card({ id: "cooking", topic_label: "烹饪", embedding_json: JSON.stringify([0, 1]) }),
    ];
    const events = [event({ id: "e1", card_id: "prior-card", topic_label: "天文学" })];
    const ordered = orderCardsForDisplay(cards, events, NOW);
    expect(ordered[0]?.id).toBe("astronomy");
  });

  it("keeps a card the reader saved in that topic ahead of an untouched one", () => {
    const cards = [
      card({ id: "cooking", topic_label: "烹饪", embedding_json: JSON.stringify([0, 1]) }),
      card({ id: "astronomy", topic_label: "天文学", embedding_json: JSON.stringify([1, 0]) }),
    ];
    const events = [
      event({ id: "e1", card_id: "prior-card", topic_label: "天文学", kind: "save" }),
    ];
    const ordered = orderCardsForDisplay(cards, events, NOW);
    expect(ordered[0]?.id).toBe("astronomy");
  });

  it("shows a card with no embedding yet among the rest, not after all of them", () => {
    const cards = [
      card({ id: "embedded", topic_label: "A", embedding_json: JSON.stringify([1, 0]) }),
      // Same topic, no vector yet, but fresh and with a real cover: it must be able to win.
      card({
        id: "just-landed",
        topic_label: "A",
        cover_url: "https://example.org/cover.png",
        published_at: NOW,
        upstream_signal: 1,
      }),
    ];
    const ordered = orderCardsForDisplay(cards, [], NOW);
    expect(ordered[0]?.id).toBe("just-landed");
  });

  it("demotes a card the quality check found thin, without dropping it from the feed", () => {
    const cards = [
      card({ id: "thin", topic_label: "A", quality_score: 0 }),
      card({ id: "unrated", topic_label: "B" }),
    ];
    const ordered = orderCardsForDisplay(cards, [], NOW);
    expect(ordered.map((entry) => entry.id)).toEqual(["unrated", "thin"]);
  });

  it("leaves a well-rated card exactly where an unrated one would sit", () => {
    const rated = orderCardsForDisplay(
      [
        card({ id: "a", topic_label: "A", quality_score: 0.9 }),
        card({ id: "b", topic_label: "B" }),
      ],
      [],
      NOW,
    );
    expect(rated.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("keeps one channel from filling the head of the feed", () => {
    const cards = [
      ...["h1", "h2", "h3", "h4", "h5", "h6"].map((id, index) =>
        card({ id, topic_label: `hn-${index}`, source_id: "hacker-news", upstream_signal: 1 }),
      ),
      card({ id: "blog", topic_label: "少数派", source_id: "sspai" }),
    ];
    const ordered = orderCardsForDisplay(cards, [], NOW);
    const headSources = ordered.slice(0, 6).map((entry) => entry.source_id);
    expect(headSources.filter((source) => source === "hacker-news").length).toBeLessThanOrEqual(5);
    expect(headSources).toContain("sspai");
  });

  it("keeps a dislike permanent — the card never comes back into the feed", () => {
    const cards = [card({ id: "gone", topic_label: "A" }), card({ id: "kept", topic_label: "B" })];
    const events = [event({ id: "e1", card_id: "gone", topic_label: "A", kind: "dislike" })];
    const ordered = orderCardsForDisplay(cards, events, NOW);
    expect(ordered.map((entry) => entry.id)).toEqual(["kept"]);
  });

  it("hands unfamiliar topics a bigger share of the page when the dial says so", () => {
    const known = ["k1", "k2", "k3", "k4", "k5", "k6"].map((id) =>
      card({ id, topic_label: "天文学" }),
    );
    const strangers = ["s1", "s2", "s3", "s4", "s5", "s6"].map((id, index) =>
      card({ id, topic_label: `新领域-${index}` }),
    );
    const events = [event({ id: "e1", card_id: "prior-card", topic_label: "天文学" })];
    const countStrangers = (ordered: readonly DiscoveryCardRow[]): number =>
      ordered.slice(0, 8).filter((entry) => entry.id.startsWith("s")).length;

    const familiarLeaning = orderCardsForDisplay([...known, ...strangers], events, NOW, {
      explorationShare: 0.1,
    });
    const newLeaning = orderCardsForDisplay([...known, ...strangers], events, NOW, {
      explorationShare: 0.5,
    });
    expect(countStrangers(familiarLeaning)).toBeLessThan(countStrangers(newLeaning));
  });

  it("never brings back a card the reader already opened", () => {
    const cards = [
      card({ id: "read", topic_label: "A", opened_at: "2026-08-15T12:00:00.000Z" }),
      card({ id: "unread", topic_label: "A" }),
    ];
    expect(orderCardsForDisplay(cards, [], NOW).map((entry) => entry.id)).toEqual(["unread"]);
  });

  it("sinks a topic the reader keeps turning down below one they have no opinion about", () => {
    const cards = [
      card({ id: "refused", topic_label: "八卦", cover_url: "https://example.org/c.png" }),
      card({ id: "stranger", topic_label: "地质学" }),
    ];
    const events = [
      event({ id: "e1", card_id: "old-1", topic_label: "八卦", kind: "dislike" }),
      event({ id: "e2", card_id: "old-2", topic_label: "八卦", kind: "dislike" }),
      event({ id: "e3", card_id: "old-3", topic_label: "读过的", kind: "open" }),
    ];
    expect(orderCardsForDisplay(cards, events, NOW).map((entry) => entry.id)).toEqual([
      "stranger",
      "refused",
    ]);
  });

  it("keeps a topic in the exploration lane when the reader has only ever scrolled past it", () => {
    // Twenty impressions and nothing else: the feed showed it, the reader did nothing about it.
    const seenOften = Array.from({ length: 20 }, (_unused, index) =>
      event({ id: `i${index}`, card_id: `c${index}`, topic_label: "本地新闻", kind: "impression" }),
    );
    const events = [...seenOften, event({ id: "open", card_id: "read", topic_label: "天文学" })];
    const cards = [
      ...["k1", "k2", "k3", "k4"].map((id) => card({ id, topic_label: "天文学" })),
      ...["n1", "n2", "n3", "n4"].map((id) => card({ id, topic_label: "本地新闻" })),
    ];
    const familiarLeaning = orderCardsForDisplay(cards, events, NOW, { explorationShare: 0.1 });
    const newLeaning = orderCardsForDisplay(cards, events, NOW, { explorationShare: 0.5 });
    const localNewsOnPage = (ordered: readonly DiscoveryCardRow[]): number =>
      ordered.slice(0, 4).filter((entry) => entry.id.startsWith("n")).length;
    expect(localNewsOnPage(familiarLeaning)).toBeLessThan(localNewsOnPage(newLeaning));
  });

  it("returns an empty list for an empty pool rather than throwing", () => {
    expect(orderCardsForDisplay([], [], NOW)).toEqual([]);
  });
});
