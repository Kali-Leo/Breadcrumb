/**
 * Purpose: unit tests for runActiveRecall's budget row — a restock spends at most its share of
 * the day's queries, a spent day sends nothing at all, and the rotation cursor advances with
 * every term spent and survives into the next day so the reader's whole list gets its turn.
 */
import type { DiscoveryEventRow } from "@breadcrumb/core-db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let settingsRows = new Map<string, unknown>();
const searchMock = vi.fn(async (queries: readonly string[]) =>
  queries.map((query) => ({ query, items: [] })),
);

const events: DiscoveryEventRow[] = ["编程", "科学", "数学", "历史"].map((topic, index) => ({
  id: `e${index}`,
  card_id: `card-${index}`,
  topic_label: topic,
  kind: "save",
  value_ms: null,
  created_at: "2026-08-16T10:00:00.000Z",
}));

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    settings: {
      get: async (key: string) => settingsRows.get(key) ?? null,
      set: async (key: string, value: unknown) => {
        settingsRows.set(key, value);
      },
    },
    discovery: {
      listAllEvents: async () => events,
      listNewestCards: async () => [],
    },
  })),
}));

vi.mock("./discoveryChannels", () => ({ searchChannelsForCandidates: searchMock }));

const { runActiveRecall, DAILY_RECALL_QUERY_BUDGET } = await import("./discoveryRecall");

const NOW = new Date("2026-08-17T10:00:00.000Z");
const NEXT_DAY = new Date("2026-08-18T10:00:00.000Z");

function queriesOfCall(index: number): string[] {
  return [...((searchMock.mock.calls[index]?.[0] ?? []) as readonly string[])];
}

/** Term selection draws from Math.random (Thompson sampling picks the topics worth testing), so
 * an unpinned draw made this suite decide differently from run to run. A fixed draw is what makes
 * "these two restocks reached all four interests" mean anything. */
beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
  settingsRows = new Map();
  searchMock.mockClear();
});

describe("runActiveRecall", () => {
  it("spends a few queries and writes down what it spent", async () => {
    const outcome = await runActiveRecall(NOW);
    expect(outcome.queriesSpent).toBe(3);
    expect(settingsRows.get("discoveryRecallBudget")).toMatchObject({
      day: "2026-08-17",
      used: 3,
      cursor: 3,
    });
  });

  it("stops asking once the day's queries are gone", async () => {
    settingsRows.set("discoveryRecallBudget", {
      day: "2026-08-17",
      used: DAILY_RECALL_QUERY_BUDGET,
      cursor: 0,
    });
    const outcome = await runActiveRecall(NOW);
    expect(outcome.queriesSpent).toBe(0);
    expect(searchMock).not.toHaveBeenCalled();
  });

  /** Spec 053 F1 handoff: successive restocks used to re-ask the head of the list forever. */
  it("moves on to the reader's other interests on the next restock", async () => {
    await runActiveRecall(NOW);
    await runActiveRecall(NOW);
    const first = queriesOfCall(0);
    const second = queriesOfCall(1);
    expect(first).toHaveLength(3);
    expect(second[0]).not.toBe(first[0]);
    // The reader has four interests and a restock asks about three; two restocks reach all four.
    expect(new Set([...first, ...second]).size).toBe(4);
  });

  it("gives the day's queries back tomorrow without restarting the rotation", async () => {
    await runActiveRecall(NOW);
    await runActiveRecall(NEXT_DAY);
    expect(settingsRows.get("discoveryRecallBudget")).toMatchObject({
      day: "2026-08-18",
      used: 3,
      cursor: 6,
    });
    expect(queriesOfCall(1)[0]).not.toBe(queriesOfCall(0)[0]);
  });

  /**
   * FIXED (2026-08-17, spec 053 T10b). A round that had nothing to ask about used to write the
   * day's budget row anyway, marking the day as asked. On a fresh install the first such round
   * runs about four seconds after launch — before the reader has answered the first-run panel, so
   * the library holds no term at all — and it spent the day's one guaranteed round on nothing:
   * the restock right after the reader said what they wanted to see skipped recall, and day one
   * never searched for anything.
   */
  it("leaves the day untouched when the library had nothing to ask about", async () => {
    // A library seconds after a first launch: no positions taken, nothing read, no term anywhere.
    const remembered = events.splice(0, events.length);
    try {
      const outcome = await runActiveRecall(new Date("2026-08-17T09:00:00.000Z"));
      expect(outcome.queriesSpent).toBe(0);
      expect(searchMock).not.toHaveBeenCalled();
      expect(settingsRows.get("discoveryRecallBudget")).toBeUndefined();
    } finally {
      events.push(...remembered);
    }

    // And the very next round, once the reader has said something, asks for real.
    expect((await runActiveRecall(NOW)).queriesSpent).toBe(3);
  });

  /** A row written before the rotation existed has no cursor at all; it reads as "start at the
   * front" rather than as a broken row that costs the reader the day's recall. */
  it("reads a budget row from before the rotation existed", async () => {
    settingsRows.set("discoveryRecallBudget", { day: "2026-08-17", used: 10 });
    const outcome = await runActiveRecall(NOW);
    expect(outcome.queriesSpent).toBe(2);
    expect(settingsRows.get("discoveryRecallBudget")).toMatchObject({ used: 12, cursor: 2 });
  });
});
