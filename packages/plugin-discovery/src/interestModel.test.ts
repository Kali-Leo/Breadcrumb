/**
 * Purpose: unit tests for foldInterestFromEvents' contribution/decay math and
 * topicStatsFromEvents' counting.
 */
import { describe, expect, it } from "vitest";
import { foldInterestFromEvents, type InterestEvent, topicStatsFromEvents } from "./interestModel";

const NOW = "2026-08-16T00:00:00Z";

function event(overrides: Partial<InterestEvent>): InterestEvent {
  return { topicLabel: "编程", kind: "impression", valueMs: null, createdAt: NOW, ...overrides };
}

describe("foldInterestFromEvents", () => {
  it("weights an undecayed open event at exactly 1.0", () => {
    const [result] = foldInterestFromEvents([event({ kind: "open" })], NOW);
    expect(result?.weight).toBeCloseTo(1.0, 5);
  });

  it("weights an undecayed impression at 0.05", () => {
    const [result] = foldInterestFromEvents([event({ kind: "impression" })], NOW);
    expect(result?.weight).toBeCloseTo(0.05, 5);
  });

  it("caps dwell contribution at 2 minutes of value", () => {
    const cappedAt2min = foldInterestFromEvents(
      [event({ kind: "dwell", valueMs: 5 * 60_000 })],
      NOW,
    )[0]?.weight;
    const exactly2min = foldInterestFromEvents(
      [event({ kind: "dwell", valueMs: 2 * 60_000 })],
      NOW,
    )[0]?.weight;
    expect(cappedAt2min).toBeCloseTo(2 * 0.75, 5);
    expect(cappedAt2min).toBeCloseTo(exactly2min ?? Number.NaN, 5);
  });

  it("applies a negative contribution for dislike", () => {
    const [result] = foldInterestFromEvents([event({ kind: "dislike" })], NOW);
    expect(result?.weight).toBeCloseTo(-2.5, 5);
  });

  it("decays a one-week-old event contribution by exactly 0.9", () => {
    const oneWeekAgo = new Date(Date.parse(NOW) - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [result] = foldInterestFromEvents([event({ kind: "open", createdAt: oneWeekAgo })], NOW);
    expect(result?.weight).toBeCloseTo(0.9, 5);
  });

  it("decays a two-week-old event contribution by 0.9^2", () => {
    const twoWeeksAgo = new Date(Date.parse(NOW) - 14 * 24 * 60 * 60 * 1000).toISOString();
    const [result] = foldInterestFromEvents([event({ kind: "open", createdAt: twoWeeksAgo })], NOW);
    expect(result?.weight).toBeCloseTo(0.9 ** 2, 5);
  });

  it("sums contributions per topic and sorts descending", () => {
    const results = foldInterestFromEvents(
      [
        event({ topicLabel: "编程", kind: "open" }),
        event({ topicLabel: "编程", kind: "open" }),
        event({ topicLabel: "历史", kind: "open" }),
      ],
      NOW,
    );
    expect(results).toEqual([
      { topicLabel: "编程", weight: expect.closeTo(2.0, 5) },
      { topicLabel: "历史", weight: expect.closeTo(1.0, 5) },
    ]);
  });

  it("drops topics whose net weight falls below the noise threshold", () => {
    const results = foldInterestFromEvents(
      [event({ topicLabel: "编程", kind: "impression" })],
      NOW,
    );
    // A single 0.05 impression sits right at the boundary; two weeks of decay pushes it under.
    const twoWeeksAgo = new Date(Date.parse(NOW) - 14 * 24 * 60 * 60 * 1000).toISOString();
    const decayed = foldInterestFromEvents(
      [event({ topicLabel: "编程", kind: "impression", createdAt: twoWeeksAgo })],
      NOW,
    );
    expect(results).toHaveLength(1);
    expect(decayed).toHaveLength(0);
  });

  it("treats future-dated events as age zero instead of boosting them", () => {
    const future = new Date(Date.parse(NOW) + 60 * 60 * 1000).toISOString();
    const [result] = foldInterestFromEvents([event({ kind: "open", createdAt: future })], NOW);
    expect(result?.weight).toBeCloseTo(1.0, 5);
  });
});

describe("topicStatsFromEvents", () => {
  it("counts opens and dislikes per topic, ignoring impression/dwell for the counts", () => {
    const stats = topicStatsFromEvents([
      event({ topicLabel: "编程", kind: "open" }),
      event({ topicLabel: "编程", kind: "open" }),
      event({ topicLabel: "编程", kind: "dislike" }),
      event({ topicLabel: "历史", kind: "impression" }),
    ]);
    expect(stats).toEqual(
      expect.arrayContaining([
        { topicLabel: "编程", opens: 2, dislikes: 1 },
        { topicLabel: "历史", opens: 0, dislikes: 0 },
      ]),
    );
    expect(stats).toHaveLength(2);
  });
});
