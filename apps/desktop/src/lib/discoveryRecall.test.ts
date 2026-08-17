/**
 * Purpose: unit tests for selectRecallTerms — where the search terms come from (topics the
 * reader's signals favour, words pulled locally out of what they read, and a topic Thompson
 * wants to test), that a first-run stance can seed a term before any card has been read, and
 * that no term is asked for twice.
 */
import type { DiscoveryCardRow, DiscoveryEventRow } from "@breadcrumb/core-db";
import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getRepos: vi.fn() }));
vi.mock("./discoveryChannels", () => ({ searchChannelsForCandidates: vi.fn() }));

const { selectRecallTerms } = await import("./discoveryRecall");

const NOW = "2026-08-17T10:00:00.000Z";
/** A fixed draw keeps Thompson's pick deterministic under test. */
const fixedRandom = (): number => 0.5;

function event(overrides: Partial<DiscoveryEventRow> & { id: string }): DiscoveryEventRow {
  return {
    card_id: "card-1",
    topic_label: "编译器",
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
    topic_label: "编译器",
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

  it("leads with the topic the reader's own signals favour", () => {
    const terms = selectRecallTerms(
      {
        events: [event({ id: "e1", kind: "save" })],
        cards: [],
        nowIso: NOW,
        random: fixedRandom,
      },
      3,
    );
    expect(terms[0]).toBe("编译器");
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

  it("pulls a word out of what the reader actually read, alongside the topic itself", () => {
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
    expect(terms[0]).toBe("编译器");
    expect(terms.some((term) => term.includes("寄存"))).toBe(true);
  });

  it("never spends two queries on the same term", () => {
    const terms = selectRecallTerms(
      {
        events: [
          event({ id: "e1", kind: "save" }),
          event({ id: "e2", kind: "open" }),
          event({ id: "e3", topic_label: "天文学", kind: "open" }),
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
        events: ["编译器", "天文学", "烹饪", "历史"].map((topic, index) =>
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
});
