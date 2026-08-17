/**
 * Purpose: unit tests for the two signals that are not about a card — the first-run positions
 * land in discovery_events in the encoding the interest model actually reads (its own folding is
 * run here over the rows, so the two cannot drift apart), and a dial move is recorded without
 * ever counting as interest in a topic.
 */
import type { DiscoveryEventRow } from "@breadcrumb/core-db";
import { foldInterestFromEvents, topicStatsFromEvents } from "@breadcrumb/plugin-discovery";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { discoveryRowsToInterestEvents } from "./discoveryOrdering";

let eventRows: DiscoveryEventRow[] = [];

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    discovery: {
      insertEvent: async (row: DiscoveryEventRow) => {
        eventRows.push(row);
      },
      listAllEvents: async () => eventRows,
    },
  })),
}));

const {
  hasRecordedOnboardingStances,
  onboardingStanceValue,
  recordFeedDialMove,
  recordOnboardingStances,
} = await import("./discoveryFeedbackEvents");

const NOW = "2026-08-17T12:00:00.000Z";

beforeEach(() => {
  eventRows = [];
});

describe("first-run positions", () => {
  it("writes one row per field the reader had an opinion about, and none for 一般", async () => {
    await recordOnboardingStances([
      { topicLabel: "历史", stance: "want" },
      { topicLabel: "数学", stance: "neutral" },
      { topicLabel: "经济与商业", stance: "avoid" },
    ]);

    expect(eventRows.map((row) => [row.topic_label, row.kind, row.value_ms])).toEqual([
      ["历史", "onboarding", 1],
      ["经济与商业", "onboarding", -1],
    ]);
  });

  it("folds into a positive weight for 想看 and a negative one for 不想看", async () => {
    await recordOnboardingStances([
      { topicLabel: "历史", stance: "want" },
      { topicLabel: "经济与商业", stance: "avoid" },
    ]);

    const weights = foldInterestFromEvents(discoveryRowsToInterestEvents(eventRows), NOW);
    expect(weights.find((weight) => weight.topicLabel === "历史")?.weight).toBeGreaterThan(0);
    expect(weights.find((weight) => weight.topicLabel === "经济与商业")?.weight).toBeLessThan(0);

    const stats = topicStatsFromEvents(discoveryRowsToInterestEvents(eventRows));
    expect(stats.find((stat) => stat.topicLabel === "历史")).toMatchObject({
      opens: 1,
      dislikes: 0,
    });
    expect(stats.find((stat) => stat.topicLabel === "经济与商业")).toMatchObject({
      opens: 0,
      dislikes: 1,
    });
  });

  it("reports whether the panel has already been answered", async () => {
    expect(await hasRecordedOnboardingStances()).toBe(false);
    await recordOnboardingStances([{ topicLabel: "科学", stance: "want" }]);
    expect(await hasRecordedOnboardingStances()).toBe(true);
  });

  it("encodes the three positions as sign, magnitude one", () => {
    expect(onboardingStanceValue("want")).toBe(1);
    expect(onboardingStanceValue("avoid")).toBe(-1);
    expect(onboardingStanceValue("neutral")).toBeNull();
  });
});

describe("dial moves", () => {
  it("records the share in thousandths and stays out of the interest fold", async () => {
    await recordFeedDialMove(0.4);

    expect(eventRows[0]).toMatchObject({ kind: "dial", value_ms: 400 });
    expect(discoveryRowsToInterestEvents(eventRows)).toEqual([]);
    expect(foldInterestFromEvents(discoveryRowsToInterestEvents(eventRows), NOW)).toEqual([]);
  });
});
