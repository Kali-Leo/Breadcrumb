/**
 * Purpose: unit tests for the small-wins list — new-concept vs reencounter classification
 * at the window boundary, deduping word guesses per lemma, teach-session inclusion, empty
 * window, and newest-first ordering.
 */
import type { ConversationRow, DiglotWordGuessRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeSmallWins } from "./smallWins";

const WINDOW = { sinceIso: "2026-08-06T00:00:00.000Z", nowIso: "2026-08-13T12:00:00.000Z" };

function sighting(nodeId: string, createdAt: string): NodeSightingRow {
  return {
    id: `s-${nodeId}-${createdAt}`,
    node_id: nodeId,
    conversation_id: "c1",
    message_id: null,
    created_at: createdAt,
  };
}

function guess(
  lemma: string,
  grade: DiglotWordGuessRow["grade"],
  createdAt: string,
): DiglotWordGuessRow {
  return {
    id: `g-${lemma}-${createdAt}`,
    lemma,
    pair: "zh:en",
    guess: "x",
    grade,
    context: "c",
    latency_ms: 1000,
    created_at: createdAt,
  };
}

function teachConversation(
  id: string,
  title: string,
  createdAt: string,
  kind: ConversationRow["kind"] = "teach",
): ConversationRow {
  return { id, title, created_at: createdAt, updated_at: createdAt, kind };
}

const nodeTitleById = new Map([
  ["n1", "递归"],
  ["n2", "闭包"],
]);

describe("computeSmallWins", () => {
  it("returns nothing for an empty window", () => {
    expect(computeSmallWins({ sightings: [], nodeTitleById, window: WINDOW })).toEqual([]);
  });

  it("classifies a node whose first-ever sighting falls inside the window as new-concept", () => {
    const wins = computeSmallWins({
      sightings: [sighting("n1", "2026-08-10T00:00:00.000Z")],
      nodeTitleById,
      window: WINDOW,
    });
    expect(wins).toEqual([
      { kind: "new-concept", label: "新认识:递归", occurredAtIso: "2026-08-10T00:00:00.000Z" },
    ]);
  });

  it("classifies a node first met before the window as a reencounter, at its latest window time", () => {
    const wins = computeSmallWins({
      sightings: [
        sighting("n1", "2026-08-01T00:00:00.000Z"),
        sighting("n1", "2026-08-07T00:00:00.000Z"),
        sighting("n1", "2026-08-11T00:00:00.000Z"),
      ],
      nodeTitleById,
      window: WINDOW,
    });
    expect(wins).toEqual([
      { kind: "reencounter", label: "重逢:递归", occurredAtIso: "2026-08-11T00:00:00.000Z" },
    ]);
  });

  it("treats a first sighting exactly at the window start as new-concept (inclusive boundary)", () => {
    const wins = computeSmallWins({
      sightings: [sighting("n1", WINDOW.sinceIso)],
      nodeTitleById,
      window: WINDOW,
    });
    expect(wins[0]?.kind).toBe("new-concept");
  });

  it("ignores a sighting one instant before the window starts", () => {
    const wins = computeSmallWins({
      sightings: [sighting("n1", "2026-08-05T23:59:59.999Z")],
      nodeTitleById,
      window: WINDOW,
    });
    expect(wins).toEqual([]);
  });

  it("dedupes correct/close guesses to one entry per lemma, keeping the latest, and drops wrong guesses", () => {
    const wins = computeSmallWins({
      sightings: [],
      nodeTitleById,
      guesses: [
        guess("book", "correct", "2026-08-08T00:00:00.000Z"),
        guess("book", "close", "2026-08-10T00:00:00.000Z"),
        guess("cat", "wrong", "2026-08-09T00:00:00.000Z"),
      ],
      window: WINDOW,
    });
    expect(wins).toEqual([
      {
        kind: "word-guess",
        label: "词汇:「book」接近了",
        occurredAtIso: "2026-08-10T00:00:00.000Z",
      },
    ]);
  });

  it("labels a correct guess distinctly from a close one", () => {
    const wins = computeSmallWins({
      sightings: [],
      nodeTitleById,
      guesses: [guess("dog", "correct", "2026-08-08T00:00:00.000Z")],
      window: WINDOW,
    });
    expect(wins[0]?.label).toBe("词汇:「dog」猜对了");
  });

  it("includes teach-kind conversations inside the window and excludes other kinds", () => {
    const wins = computeSmallWins({
      sightings: [],
      nodeTitleById,
      teachConversations: [
        teachConversation("c1", "回讲:递归", "2026-08-09T00:00:00.000Z", "teach"),
        teachConversation("c2", "闲聊", "2026-08-09T00:00:00.000Z", "chat"),
      ],
      window: WINDOW,
    });
    expect(wins).toEqual([
      {
        kind: "teach-session",
        label: "回讲了一次:回讲:递归",
        occurredAtIso: "2026-08-09T00:00:00.000Z",
      },
    ]);
  });

  it("orders every kind newest-first together", () => {
    const wins = computeSmallWins({
      sightings: [sighting("n1", "2026-08-07T00:00:00.000Z")],
      nodeTitleById,
      guesses: [guess("book", "correct", "2026-08-12T00:00:00.000Z")],
      teachConversations: [teachConversation("c1", "回讲", "2026-08-09T00:00:00.000Z")],
      window: WINDOW,
    });
    expect(wins.map((win) => win.kind)).toEqual(["word-guess", "teach-session", "new-concept"]);
  });
});
