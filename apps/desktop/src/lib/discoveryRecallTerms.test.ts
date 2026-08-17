/**
 * Purpose: unit tests for selectRecallTerms — where the search terms come from (fields the reader
 * took a position on, words pulled locally out of what they read, and a field Thompson wants to
 * test), that a first-run stance can seed a term before any card has been read, that no term is
 * asked for twice, that nothing describing where the reader gets their content ever becomes a
 * query, and that successive restocks work their way through the list instead of re-asking the
 * front of it.
 */
import type { DiscoveryCardRow, DiscoveryEventRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { selectRecallTerms } from "./discoveryRecallTerms";

const NOW = "2026-08-17T10:00:00.000Z";
/** A fixed draw keeps Thompson's pick deterministic under test. */
const fixedRandom = (): number => 0.5;

/** A field the first-run panel offers, which is where a topic term is allowed to come from. */
const FIELD = "编程与技术";

function event(overrides: Partial<DiscoveryEventRow> & { id: string }): DiscoveryEventRow {
  return {
    card_id: "card-1",
    topic_label: FIELD,
    kind: "open",
    value_ms: null,
    created_at: "2026-08-16T10:00:00.000Z",
    ...overrides,
  };
}

function card(id: string, title: string, hook: string): DiscoveryCardRow {
  return {
    id,
    title,
    hook,
    topic_label: FIELD,
    source: "explore",
    body_md: null,
    embedding_json: null,
    batch_id: "batch",
    created_at: "2026-08-16T00:00:00.000Z",
    opened_at: "2026-08-16T10:00:00.000Z",
    source_id: "sample",
    kind: "article",
    url: `https://example.org/${id}`,
    cover_url: null,
    author: null,
    published_at: "2026-08-16T00:00:00.000Z",
    saved_at: null,
    quality_score: null,
    upstream_signal: null,
    media_url: null,
  };
}

describe("selectRecallTerms", () => {
  it("asks for nothing when the reader has done nothing yet", () => {
    expect(
      selectRecallTerms({ events: [], cards: [], nowIso: NOW, random: fixedRandom }, 3),
    ).toEqual([]);
  });

  it("leads with the field the reader's own signals favour", () => {
    const terms = selectRecallTerms(
      {
        events: [event({ id: "e1", kind: "save" })],
        cards: [],
        nowIso: NOW,
        random: fixedRandom,
      },
      3,
    );
    expect(terms[0]).toBe(FIELD);
  });

  it("takes a term from a first-run stance before any card has been read", () => {
    const terms = selectRecallTerms(
      {
        events: [event({ id: "e1", kind: "onboarding", topic_label: "天文学", value_ms: 1 })],
        cards: [],
        nowIso: NOW,
        random: fixedRandom,
      },
      3,
    );
    expect(terms).toContain("天文学");
  });

  it("pulls a word out of what the reader actually read, alongside the field itself", () => {
    const terms = selectRecallTerms(
      {
        events: [
          event({ id: "e1", card_id: "c1", kind: "finish" }),
          event({ id: "e2", card_id: "c2", kind: "open" }),
        ],
        cards: [
          card("c1", "把寄存器分配讲清楚", "寄存器分配的图着色做法。"),
          card("c2", "再谈寄存器分配", "寄存器分配在真实编译器里的样子。"),
        ],
        nowIso: NOW,
        random: fixedRandom,
      },
      3,
    );
    expect(terms[0]).toBe(FIELD);
    expect(terms.some((term) => term.includes("寄存"))).toBe(true);
  });

  /**
   * Spec 053 T9 finding #1. A card is filed under the channel that published it, and for a feed
   * the reader pasted in that is the address's hostname — under the bug, the address itself. None
   * of it describes a subject, and none of it is ours to send to Hacker News or arXiv.
   */
  it("never turns where the reader gets their content into a query", () => {
    const terms = selectRecallTerms(
      {
        events: [
          event({ id: "e1", topic_label: "blog.example", kind: "save" }),
          event({ id: "e2", topic_label: "user-feed:https://blog.example/feed.xml", kind: "save" }),
          event({ id: "e3", topic_label: "少数派", kind: "finish" }),
          event({ id: "e4", kind: "save" }),
        ],
        cards: [],
        nowIso: NOW,
        random: fixedRandom,
      },
      4,
    );
    expect(terms).toEqual([FIELD]);
  });

  it("keeps searching for a term that already brought cards home", () => {
    const recalled: DiscoveryCardRow = {
      ...card("c9", "寄存器分配入门", "一篇讲解。"),
      topic_label: "寄存器分配",
      source: "nearby",
    };
    const terms = selectRecallTerms(
      {
        events: [event({ id: "e1", card_id: "c9", topic_label: "寄存器分配", kind: "save" })],
        cards: [recalled],
        nowIso: NOW,
        random: fixedRandom,
      },
      3,
    );
    expect(terms).toContain("寄存器分配");
  });

  it("never spends two queries on the same term", () => {
    const terms = selectRecallTerms(
      {
        events: [
          event({ id: "e1", kind: "save" }),
          event({ id: "e2", kind: "open" }),
          event({ id: "e3", topic_label: "科学", kind: "open" }),
        ],
        cards: [],
        nowIso: NOW,
        random: fixedRandom,
      },
      4,
    );
    expect(new Set(terms).size).toBe(terms.length);
  });

  it("never asks for more terms than the budget allows", () => {
    const terms = selectRecallTerms(
      {
        events: ["编程与技术", "科学", "数学", "历史"].map((topic, index) =>
          event({ id: `e${index}`, topic_label: topic, kind: "save" }),
        ),
        cards: [],
        nowIso: NOW,
        random: fixedRandom,
      },
      2,
    );
    expect(terms).toHaveLength(2);
  });

  /**
   * Spec 053 F1 handoff. Three queries a restock against a list that always started at index 0
   * meant the reader's second and third interests were never searched for, however many restocks
   * a day held.
   */
  it("works its way through the list as the cursor advances, and wraps around", () => {
    const events = ["编程与技术", "科学", "数学", "历史"].map((topic, index) =>
      event({ id: `e${index}`, topic_label: topic, kind: "save" }),
    );
    const at = (cursor: number): string[] =>
      selectRecallTerms({ events, cards: [], nowIso: NOW, cursor, random: fixedRandom }, 2);
    const first = at(0);
    const second = at(2);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first.filter((term) => second.includes(term))).toEqual([]);
    expect(at(4)).toEqual(first);
  });
});
