/**
 * Purpose: unit tests for pickExploreTopics — determinism under a seeded random source, and
 * that a topic with strongly better open/dislike evidence wins the draw far more often.
 */
import { describe, expect, it } from "vitest";
import { pickExploreTopics } from "./thompson";

/** Deterministic mulberry32 PRNG — same seed always produces the same [0,1) sequence, so
 * tests never flake. */
function makeSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("pickExploreTopics", () => {
  it("is deterministic: the same seed produces the same pick", () => {
    const stats = [
      { topicLabel: "编程", opens: 5, dislikes: 1 },
      { topicLabel: "历史", opens: 2, dislikes: 3 },
      { topicLabel: "艺术", opens: 0, dislikes: 0 },
    ];
    const first = pickExploreTopics(stats, 2, makeSeededRandom(42));
    const second = pickExploreTopics(stats, 2, makeSeededRandom(42));
    expect(first).toEqual(second);
  });

  it("different seeds can produce different picks (the source is actually consulted)", () => {
    const stats = [
      { topicLabel: "编程", opens: 5, dislikes: 1 },
      { topicLabel: "历史", opens: 2, dislikes: 3 },
      { topicLabel: "艺术", opens: 1, dislikes: 1 },
      { topicLabel: "音乐", opens: 4, dislikes: 4 },
    ];
    const picks = new Set(
      Array.from({ length: 20 }, (_, i) => pickExploreTopics(stats, 1, makeSeededRandom(i)).join()),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it("returns at most `count` topics and never invents a topic label", () => {
    const stats = [
      { topicLabel: "编程", opens: 1, dislikes: 0 },
      { topicLabel: "历史", opens: 0, dislikes: 1 },
    ];
    const picks = pickExploreTopics(stats, 5, makeSeededRandom(1));
    expect(picks.length).toBeLessThanOrEqual(2);
    for (const label of picks) expect(["编程", "历史"]).toContain(label);
  });

  it("returns an empty list for empty stats", () => {
    expect(pickExploreTopics([], 3, makeSeededRandom(1))).toEqual([]);
  });

  it("picks a topic with much stronger open/dislike evidence far more often across seeds", () => {
    const stats = [
      { topicLabel: "strong", opens: 40, dislikes: 1 },
      { topicLabel: "weak", opens: 1, dislikes: 20 },
    ];
    let strongWins = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      const [top] = pickExploreTopics(stats, 1, makeSeededRandom(i * 7919 + 3));
      if (top === "strong") strongWins++;
    }
    expect(strongWins).toBeGreaterThan(trials * 0.9);
  });
});
