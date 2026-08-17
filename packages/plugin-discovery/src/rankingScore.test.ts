/**
 * Purpose: unit tests for rankingScore — the reader's own history is the primary axis, the item's
 * flat features only break ties between comparable items, a topic the reader refused ranks below
 * one they have no opinion about, and the quality demotion keeps its full weight.
 */
import { describe, expect, it } from "vitest";
import {
  defaultRankingWeights,
  type RankingInput,
  rankingScore,
  topicAffinities,
} from "./rankingScore";

function input(overrides: Partial<RankingInput> = {}): RankingInput {
  return {
    topicAffinity: 0,
    centroidScore: 0,
    contentBonus: 0,
    qualityDemotion: 0,
    ...overrides,
  };
}

/** Everything an item can carry on its own: a front-page crowd, a real cover, published now. */
const EVERY_FEATURE = 0.53;

describe("rankingScore", () => {
  it("puts a topic the reader reads ahead of a stranger carrying every flat feature", () => {
    const read = rankingScore(input({ topicAffinity: 0.9 }));
    const decorated = rankingScore(input({ contentBonus: EVERY_FEATURE }));
    expect(read).toBeGreaterThan(decorated);
    // Not by a whisker: the gap is most of a full affinity, not a rounding difference.
    expect(read - decorated).toBeGreaterThan(0.5);
  });

  it("puts a topic the reader refused below one they have no opinion about", () => {
    const refused = rankingScore(input({ topicAffinity: -0.9, contentBonus: EVERY_FEATURE }));
    const unknown = rankingScore(input());
    expect(refused).toBeLessThan(unknown);
  });

  it("still orders two cards of the same topic by what they carry", () => {
    const withCover = rankingScore(input({ topicAffinity: 0.9, contentBonus: 0.3 }));
    const bare = rankingScore(input({ topicAffinity: 0.9 }));
    expect(withCover).toBeGreaterThan(bare);
    expect(withCover - bare).toBeLessThanOrEqual(defaultRankingWeights.maximumContentBonus);
  });

  it("caps the whole flat contribution well below one topic's worth", () => {
    const maximum = rankingScore(input({ contentBonus: EVERY_FEATURE * 2 }));
    expect(maximum).toBeCloseTo(defaultRankingWeights.maximumContentBonus, 5);
  });

  it("treats unreadable numbers as saying nothing rather than as a score", () => {
    expect(rankingScore(input({ topicAffinity: Number.NaN }))).toBe(0);
    expect(rankingScore(input({ centroidScore: Number.POSITIVE_INFINITY }))).toBe(0);
  });

  it("applies the quality demotion at full size, unscaled", () => {
    const rated = rankingScore(input({ topicAffinity: 0.9, qualityDemotion: 0.4 }));
    const unrated = rankingScore(input({ topicAffinity: 0.9 }));
    expect(unrated - rated).toBeCloseTo(0.4, 5);
  });

  it("adds the centroid similarity on top of the topic, at its own smaller weight", () => {
    const onCentroid = rankingScore(input({ topicAffinity: 0.9, centroidScore: 1 }));
    const offCentroid = rankingScore(input({ topicAffinity: 0.9, centroidScore: 0 }));
    expect(onCentroid - offCentroid).toBeCloseTo(defaultRankingWeights.centroidSimilarity, 5);
  });
});

describe("topicAffinities", () => {
  const weights = [
    { topicLabel: "编译器", weight: 420 },
    { topicLabel: "神经科学", weight: 340 },
    { topicLabel: "本地新闻", weight: 42 },
    { topicLabel: "八卦", weight: -85 },
  ];

  it("separates the topics the reader reads from the ones the feed merely showed them", () => {
    const affinities = topicAffinities(weights);
    expect(affinities.get("编译器") ?? 0).toBeGreaterThan(0.9);
    expect(affinities.get("本地新闻") ?? 0).toBeLessThan(0.3);
    // The gap is far wider than everything an item can carry on its own.
    expect((affinities.get("编译器") ?? 0) - (affinities.get("本地新闻") ?? 0)).toBeGreaterThan(
      defaultRankingWeights.maximumContentBonus * 4,
    );
  });

  it("puts a refused topic below every topic the reader has not refused", () => {
    const affinities = topicAffinities(weights);
    expect(affinities.get("八卦") ?? 0).toBeLessThan(0);
    expect(affinities.get("八卦") ?? 0).toBeLessThan(affinities.get("本地新闻") ?? 0);
  });

  it("reads the same on a month-old library as on a fresh one", () => {
    // A feed that shows two hundred cards a day inflates every weight; only the ratios mean
    // anything, so ten times the evidence must produce the same standing.
    const inflated = weights.map((entry) => ({ ...entry, weight: entry.weight * 10 }));
    for (const [topic, affinity] of topicAffinities(weights)) {
      expect(topicAffinities(inflated).get(topic) ?? 0).toBeCloseTo(affinity, 10);
    }
  });

  it("says nothing at all when the reader has no history", () => {
    expect(topicAffinities([])).toEqual(new Map());
  });
});
