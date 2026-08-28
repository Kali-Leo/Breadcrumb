/**
 * Purpose: the English-topic-name fallback chain. The service may send English names, some
 * English names, or none at all, and the panels must show a readable name in every case —
 * a missing translation is not a reason to show a blank.
 */
import { describe, expect, it } from "vitest";
import type { BrowsingProfile } from "./schemas";
import { englishTopicNames, topicLabel } from "./topicNames";

function profileWith(topics: string[], topicsEn?: string[]): BrowsingProfile {
  return {
    topics,
    topics_en: topicsEn,
    groups: {},
    short: [],
    long: [],
    expose: [],
    prefs: {},
    drivers: {},
    n_events: 0,
    classifier: "test",
    emotion_on: false,
  };
}

describe("englishTopicNames", () => {
  it("pairs the two lists by position", () => {
    const names = englishTopicNames(
      profileWith(["机器学习", "摄影"], ["Machine learning", "Photography"]),
    );
    expect(names.get("机器学习")).toBe("Machine learning");
  });

  it("is empty when the service sent no English list at all", () => {
    expect(englishTopicNames(profileWith(["机器学习"])).size).toBe(0);
    expect(englishTopicNames(null).size).toBe(0);
  });

  it("skips the topics whose English name is missing or blank", () => {
    const names = englishTopicNames(profileWith(["机器学习", "摄影"], ["Machine learning", "  "]));
    expect(names.has("摄影")).toBe(false);
  });
});

describe("topicLabel", () => {
  const names = new Map([["机器学习", "Machine learning"]]);

  it("leaves the topic alone in a Chinese interface", () => {
    expect(topicLabel("机器学习", { preferEnglish: false, englishNames: names })).toBe("机器学习");
  });

  it("prefers the entry's own English name over the profile-wide one", () => {
    expect(
      topicLabel("机器学习", { preferEnglish: true, englishNames: names, ownEnglishName: "ML" }),
    ).toBe("ML");
  });

  it("falls back to the profile map, then to the original name", () => {
    expect(topicLabel("机器学习", { preferEnglish: true, englishNames: names })).toBe(
      "Machine learning",
    );
    expect(topicLabel("摄影", { preferEnglish: true, englishNames: names })).toBe("摄影");
    expect(topicLabel("摄影", { preferEnglish: true })).toBe("摄影");
  });
});
