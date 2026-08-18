/**
 * Purpose: unit tests for the language vocabulary (spec 054) — what a fresh install starts on,
 * and how the reader's stored answer becomes the set both filters read.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultFeedLanguage,
  FEED_LANGUAGE_CHOICES,
  resolveFeedLanguagePolicy,
} from "./discoveryLanguages";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what the feed can be set to", () => {
  it("offers the two languages the shipped catalog publishes in, each named in its own writing", () => {
    expect(FEED_LANGUAGE_CHOICES.map((choice) => [choice.language, choice.label])).toEqual([
      ["zh", "中文"],
      ["en", "English"],
    ]);
  });

  it("starts on Chinese, and on English only when the machine itself speaks it", () => {
    vi.stubGlobal("navigator", { language: "zh-CN" });
    expect(defaultFeedLanguage()).toBe("zh");
    vi.stubGlobal("navigator", { language: "fr-FR" });
    expect(defaultFeedLanguage()).toBe("zh");
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(defaultFeedLanguage()).toBe("en");
  });
});

describe("what the stored answer means", () => {
  it("uses the language the reader chose", () => {
    const policy = resolveFeedLanguagePolicy({
      feedLanguage: "en",
      additionalFeedLanguages: [],
    });
    expect(policy.enabledLanguages).toEqual(["en"]);
  });

  it("adds the ones switched on in the language settings, without repeating the chosen one", () => {
    const policy = resolveFeedLanguagePolicy({
      feedLanguage: "zh",
      additionalFeedLanguages: ["en", "zh"],
    });
    expect(policy.enabledLanguages).toEqual(["zh", "en"]);
  });

  it("falls back to the default rather than to showing everything when nobody has answered", () => {
    vi.stubGlobal("navigator", { language: "zh-CN" });
    const policy = resolveFeedLanguagePolicy({
      feedLanguage: null,
      additionalFeedLanguages: [],
    });
    expect(policy.enabledLanguages).toEqual(["zh"]);
  });

  it("has academic content on until the switch that belongs to its own task says otherwise", () => {
    const on = resolveFeedLanguagePolicy({ feedLanguage: "zh", additionalFeedLanguages: [] });
    expect(on.academicContentEnabled).toBe(true);
    const off = resolveFeedLanguagePolicy({
      feedLanguage: "zh",
      additionalFeedLanguages: [],
      academicContentEnabled: false,
    });
    expect(off.academicContentEnabled).toBe(false);
  });
});
