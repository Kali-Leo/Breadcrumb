/**
 * Purpose: the feed's two modes (spec 054, Leo's eighth point) — that the filter is strict in both
 * directions, that "both" is what keeps either mode from running dry, that a channel the reader
 * switched on by hand is never hidden by a mode, and that a source nobody labelled is shown rather
 * than dropped.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { loadStarterChannelCatalog } from "@breadcrumb/plugin-channels";
import { describe, expect, it } from "vitest";
import {
  cardPassesModeFilter,
  DEFAULT_FEED_MODE,
  FEED_MODE_CHOICES,
  type FeedMode,
  resolveFeedModePolicy,
} from "./discoveryFeedMode";

function cardFrom(sourceId: string | null): Pick<DiscoveryCardRow, "source_id"> {
  return { source_id: sourceId };
}

function shows(sourceId: string | null, mode: FeedMode, chosen: readonly string[] = []): boolean {
  return cardPassesModeFilter(cardFrom(sourceId), { mode, readerChosenSourceIds: chosen });
}

/** Real catalog ids, so a re-labelling that breaks the premise of these tests fails them. */
const PROFESSIONAL = "juejin";
const CASUAL = "appinn";
const BOTH = "sspai";

describe("the labels these tests stand on", () => {
  it("still reads them out of the shipped catalog", () => {
    const toneOf = (id: string): string | undefined =>
      loadStarterChannelCatalog().sources.find((source) => source.id === id)?.tone;
    expect([toneOf(PROFESSIONAL), toneOf(CASUAL), toneOf(BOTH)]).toEqual([
      "professional",
      "casual",
      "both",
    ]);
  });
});

describe("cardPassesModeFilter", () => {
  it("keeps professional content out of 休闲 and casual content out of 专业", () => {
    expect(shows(PROFESSIONAL, "casual")).toBe(false);
    expect(shows(CASUAL, "professional")).toBe(false);
  });

  it("shows each side its own sources", () => {
    expect(shows(CASUAL, "casual")).toBe(true);
    expect(shows(PROFESSIONAL, "professional")).toBe(true);
  });

  it("shows a source that serves either mood in both modes", () => {
    expect(shows(BOTH, "casual")).toBe(true);
    expect(shows(BOTH, "professional")).toBe(true);
  });

  it("never hides a channel the reader switched on by hand", () => {
    expect(shows(PROFESSIONAL, "casual", [PROFESSIONAL])).toBe(true);
    expect(shows(CASUAL, "professional", [CASUAL])).toBe(true);
  });

  it("shows a card whose source belongs to no mode — a pasted feed, or one no longer in the catalog", () => {
    expect(shows("user-feed:https://blog.example.org/atom.xml", "professional")).toBe(true);
    expect(shows("a-source-this-build-has-never-heard-of", "casual")).toBe(true);
    expect(shows(null, "professional")).toBe(true);
  });
});

describe("resolveFeedModePolicy", () => {
  it("starts a reader who has never chosen on 休闲", () => {
    expect(resolveFeedModePolicy({}).mode).toBe("casual");
    expect(DEFAULT_FEED_MODE).toBe("casual");
  });

  it("takes the mode the reader chose", () => {
    expect(resolveFeedModePolicy({ feedMode: "professional" }).mode).toBe("professional");
  });

  it("counts only the channels switched on, not the ones switched off", () => {
    const policy = resolveFeedModePolicy({
      channelEnabledById: { juejin: true, appinn: false },
    });
    expect(policy.readerChosenSourceIds).toEqual(["juejin"]);
  });
});

describe("what the two segments are called", () => {
  it("names both states, in Leo's own words", () => {
    expect(FEED_MODE_CHOICES.map((choice) => choice.label)).toEqual(["休闲", "专业"]);
  });

  it("says what each one does to the feed in a full sentence beside the name", () => {
    for (const choice of FEED_MODE_CHOICES) {
      expect(choice.hint.length).toBeGreaterThan(choice.label.length);
    }
  });
});
