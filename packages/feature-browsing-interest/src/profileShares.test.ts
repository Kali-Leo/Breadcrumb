import { describe, expect, it } from "vitest";
import { createProfileState } from "./profileEngine";
import {
  exposureLift,
  MIN_EXPOSURE_SHARE,
  normalizeShares,
  profileDistributions,
  setTopicPreference,
  topDriverTopics,
  topicAffinity,
} from "./profileShares";
import { TOPIC_LEAVES } from "./taxonomy";

const spread = (values: Record<number, number>): number[] => {
  const vector = new Array<number>(48).fill(0);
  for (const [index, value] of Object.entries(values)) vector[Number(index)] = value;
  return vector;
};

describe("normalizeShares", () => {
  it("turns counts into shares that sum to one", () => {
    expect(normalizeShares([1, 3])).toEqual([0.25, 0.75]);
  });

  it("returns an all-zero vector unchanged rather than as NaNs", () => {
    expect(normalizeShares([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("does not alias the input", () => {
    const input = [0, 0];
    expect(normalizeShares(input)).not.toBe(input);
  });
});

describe("exposureLift", () => {
  it("reports above 1 when the learner chose a topic more than it was fed to them", () => {
    const lift = exposureLift({ short: [0.6, 0.4], long: [], expose: [0.2, 0.8] });
    expect(lift[0]).toBe(3);
    expect(lift[1]).toBe(0.5);
  });

  it("floors the denominator, so a barely-shown topic cannot report infinite lift", () => {
    const lift = exposureLift({ short: [1], long: [], expose: [0] });
    expect(lift[0]).toBe(Math.round((1 / MIN_EXPOSURE_SHARE) * 100) / 100);
    expect(Number.isFinite(lift[0] ?? Number.NaN)).toBe(true);
  });
});

describe("setTopicPreference", () => {
  it("clamps to the declared range", () => {
    const state = createProfileState();
    const topic = TOPIC_LEAVES[0] ?? "";
    setTopicPreference(state, topic, 99);
    expect(state.prefs[topic]).toBe(2);
    setTopicPreference(state, topic, -99);
    expect(state.prefs[topic]).toBe(-2);
  });

  it("refuses a topic outside the taxonomy instead of inventing a slot for a typo", () => {
    const state = createProfileState();
    expect(setTopicPreference(state, "编程与软件开發", 2)).toBe(false);
    expect(Object.keys(state.prefs)).toHaveLength(0);
  });
});

describe("topicAffinity", () => {
  const first = TOPIC_LEAVES[0] ?? "";
  const second = TOPIC_LEAVES[1] ?? "";

  it("scores behaviour when nothing has been declared", () => {
    const state = createProfileState();
    state.long = spread({ 0: 3, 1: 1 });
    expect(topicAffinity(state, spread({ 0: 1 }))).toBe(0.75);
  });

  it("lets a declaration outrank behaviour without erasing it", () => {
    const state = createProfileState();
    state.long = spread({ 0: 3, 1: 1 });
    const behaviourOnly = topicAffinity(state, spread({ 1: 1 }));
    setTopicPreference(state, second, 2);
    const declared = topicAffinity(state, spread({ 1: 1 }));
    // A full declaration adds 1.0, more than any long-term share (all below 1 by construction).
    expect(declared - behaviourOnly).toBe(1);
    expect(declared).toBeGreaterThan(topicAffinity(state, spread({ 0: 1 })));
  });

  it("lets a negative declaration push a topic below zero", () => {
    const state = createProfileState();
    state.long = spread({ 0: 1 });
    setTopicPreference(state, first, -2);
    expect(topicAffinity(state, spread({ 0: 1 }))).toBe(0);
    state.long = spread({ 0: 1, 1: 9 });
    expect(topicAffinity(state, spread({ 0: 1 }))).toBeLessThan(0);
  });

  it("weighs a mixed distribution across topics", () => {
    const state = createProfileState();
    state.long = spread({ 0: 2, 1: 2 });
    expect(topicAffinity(state, spread({ 0: 0.5, 1: 0.5 }))).toBe(0.5);
  });
});

describe("topDriverTopics", () => {
  it("returns the largest long-term shares, largest first", () => {
    const distributions = profileDistributions({
      ...createProfileState(),
      long: spread({ 4: 5, 7: 9, 2: 1 }),
    });
    expect(topDriverTopics(distributions, 2)).toEqual([7, 4]);
  });

  it("breaks ties by index, so the order is stable across runs", () => {
    const distributions = profileDistributions({ ...createProfileState(), long: spread({}) });
    expect(topDriverTopics(distributions, 3)).toEqual([0, 1, 2]);
  });
});
