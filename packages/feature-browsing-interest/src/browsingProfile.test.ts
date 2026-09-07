import { describe, expect, it } from "vitest";
import { buildBrowsingProfile, DRIVER_TOPIC_COUNT } from "./browsingProfile";
import { createProfileState } from "./profileEngine";
import { browsingProfileSchema } from "./schemas";
import { TOPIC_LEAVES } from "./taxonomy";

const base = {
  eventCount: 0,
  engagedCount: 0,
  engagedRows: [],
  classifier: "ngram",
  emotionOn: false,
};

describe("buildBrowsingProfile", () => {
  it("produces something the panels' own schema accepts, even with no history", () => {
    const profile = buildBrowsingProfile({ ...base, state: createProfileState() });
    expect(() => browsingProfileSchema.parse(profile)).not.toThrow();
    expect(profile.topics).toHaveLength(48);
    expect(profile.topics_en).toHaveLength(48);
    expect(Object.keys(profile.groups)).toHaveLength(13);
    expect(profile.drivers).toEqual({});
  });

  it("illustrates the leading topics with real titles, and only those with any", () => {
    const state = createProfileState();
    state.long[0] = 10;
    state.long[1] = 5;
    const profile = buildBrowsingProfile({
      ...base,
      state,
      engagedRows: [
        { topic: 0, title: "第一", up: "甲" },
        { topic: 0, title: "第二", up: "乙" },
        { topic: 0, title: "第三", up: "丙" },
        { topic: 0, title: "第四", up: "丁" },
      ],
    });
    const first = TOPIC_LEAVES[0] ?? "";
    expect(profile.drivers[first]).toHaveLength(3);
    expect(profile.drivers[first]?.[0]).toEqual({ title: "第一", up: "甲" });
    // Topic 1 is a driver by share but has nothing to show, so it is not claimed.
    expect(Object.keys(profile.drivers)).toEqual([first]);
    expect(Object.keys(profile.drivers).length).toBeLessThanOrEqual(DRIVER_TOPIC_COUNT);
  });

  it("carries the exposure correction, so a fed topic can be told from a chosen one", () => {
    const state = createProfileState();
    state.short[0] = 1;
    state.expose[1] = 1;
    const profile = buildBrowsingProfile({ ...base, state });
    expect(profile.lift?.[0]).toBeGreaterThan(1);
    expect(profile.lift?.[1]).toBe(0);
  });

  it("reports engaged and total counts separately", () => {
    const profile = buildBrowsingProfile({
      ...base,
      state: createProfileState(),
      eventCount: 900,
      engagedCount: 40,
    });
    expect(profile.n_events).toBe(900);
    expect(profile.n_engaged).toBe(40);
  });
});
