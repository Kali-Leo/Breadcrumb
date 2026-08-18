/**
 * Purpose: unit tests for the two places the language choice is applied (spec 054) — which
 * channels are worth a request and which cards are worth a place on the grid. The cases that
 * matter most are the ones that must NOT be filtered: papers, channels with no language of their
 * own, and any card whose words are too short or too mixed to judge.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { type ChannelSource, channelSourceSchema } from "@breadcrumb/plugin-channels";
import { describe, expect, it } from "vitest";
import {
  cardPassesLanguageFilter,
  channelSourcePassesLanguageFilter,
} from "./discoveryLanguageFilter";
import type { FeedLanguagePolicy } from "./discoveryLanguages";

const CHINESE_ONLY: FeedLanguagePolicy = {
  enabledLanguages: ["zh"],
  academicContentEnabled: true,
  readerChosenSourceIds: [],
};
const BOTH_LANGUAGES: FeedLanguagePolicy = {
  enabledLanguages: ["zh", "en"],
  academicContentEnabled: true,
  readerChosenSourceIds: [],
};
const NO_ACADEMIC: FeedLanguagePolicy = {
  enabledLanguages: ["zh"],
  academicContentEnabled: false,
  readerChosenSourceIds: [],
};

function sourceWith(language: string, defaultKind: string): ChannelSource {
  return channelSourceSchema.parse({
    id: `test-${language}-${defaultKind}`,
    displayName: "测试来源",
    adapterType: "generic-feed",
    endpoint: { feedUrl: "https://example.org/feed" },
    language,
    defaultKind,
    defaultEnabled: true,
    fetchPolicy: {
      minimumIntervalMilliseconds: 1_800_000,
      dailyRequestBudget: 48,
      userAgentOverride: null,
    },
  });
}

function passes(source: ChannelSource, policy: FeedLanguagePolicy): boolean {
  return channelSourcePassesLanguageFilter(source, policy);
}

/** The same policy with one channel named by hand in the source settings. */
function withChosenSource(policy: FeedLanguagePolicy, sourceId: string): FeedLanguagePolicy {
  return { ...policy, readerChosenSourceIds: [sourceId] };
}

describe("which channels are worth a request", () => {
  it("serves the chosen language and holds the other one back", () => {
    expect(passes(sourceWith("zh-CN", "article"), CHINESE_ONLY)).toBe(true);
    expect(passes(sourceWith("en", "article"), CHINESE_ONLY)).toBe(false);
    expect(passes(sourceWith("en", "article"), BOTH_LANGUAGES)).toBe(true);
  });

  it("reads the language off a regional tag, because the reader chose a language not a region", () => {
    expect(passes(sourceWith("en-GB", "article"), BOTH_LANGUAGES)).toBe(true);
    expect(passes(sourceWith("zh-TW", "article"), CHINESE_ONLY)).toBe(true);
  });

  it("holds back a language the feed cannot be set to at all", () => {
    expect(passes(sourceWith("ja", "article"), BOTH_LANGUAGES)).toBe(false);
  });

  it("always serves a channel with no language of its own — the reader added it themselves", () => {
    expect(passes(sourceWith("und", "article"), CHINESE_ONLY)).toBe(true);
  });

  it("always serves papers, whatever they are written in", () => {
    expect(passes(sourceWith("en", "paper"), CHINESE_ONLY)).toBe(true);
  });

  it("stops serving papers when academic content is switched off", () => {
    expect(passes(sourceWith("en", "paper"), NO_ACADEMIC)).toBe(false);
  });

  it("keeps a channel the reader switched on by hand, whatever it publishes in", () => {
    const english = sourceWith("en", "article");
    expect(passes(english, withChosenSource(CHINESE_ONLY, english.id))).toBe(true);
  });
});

function cardWith(
  title: string,
  hook: string,
  kind: DiscoveryCardRow["kind"] = "article",
  sourceId: string | null = "test-source",
): Pick<DiscoveryCardRow, "title" | "hook" | "kind" | "source_id"> {
  return { title, hook, kind, source_id: sourceId };
}

describe("which cards are worth a place on the grid", () => {
  it("keeps a card in the chosen language and drops one in the other", () => {
    const chinese = cardWith("睡眠与记忆", "研究人员发现睡眠对记忆的巩固有直接影响。");
    const english = cardWith(
      "Sleep and memory",
      "Researchers found that sleep directly shapes how memory settles overnight.",
    );
    expect(cardPassesLanguageFilter(chinese, CHINESE_ONLY)).toBe(true);
    expect(cardPassesLanguageFilter(english, CHINESE_ONLY)).toBe(false);
    expect(cardPassesLanguageFilter(english, BOTH_LANGUAGES)).toBe(true);
  });

  it("drops a stray in a language the feed cannot be set to, whichever language is on", () => {
    const japanese = cardWith("今日の一枚", "この写真は昨日の夕方に撮影されたものです。");
    expect(cardPassesLanguageFilter(japanese, CHINESE_ONLY)).toBe(false);
    expect(cardPassesLanguageFilter(japanese, BOTH_LANGUAGES)).toBe(false);
  });

  it("keeps a card whose words are too few to judge", () => {
    expect(cardPassesLanguageFilter(cardWith("Framatube", ""), CHINESE_ONLY)).toBe(true);
  });

  it("keeps a card whose words are genuinely mixed", () => {
    const mixed = cardWith("Transformer 架构", "self attention 机制 详解 tutorial for beginners");
    expect(cardPassesLanguageFilter(mixed, CHINESE_ONLY)).toBe(true);
  });

  it("keeps a card off a channel the reader named by hand, so it is not polled and then thrown away", () => {
    const english = cardWith(
      "Sleep and memory",
      "Researchers found that sleep directly shapes how memory settles overnight.",
      "article",
      "quanta-magazine",
    );
    expect(cardPassesLanguageFilter(english, CHINESE_ONLY)).toBe(false);
    expect(
      cardPassesLanguageFilter(english, withChosenSource(CHINESE_ONLY, "quanta-magazine")),
    ).toBe(true);
  });

  it("keeps an English paper in a Chinese feed — academic content is exempt", () => {
    const paper = cardWith(
      "Scaling laws for neural language models",
      "We study empirical scaling laws for language model performance on the cross-entropy loss.",
      "paper",
    );
    expect(cardPassesLanguageFilter(paper, CHINESE_ONLY)).toBe(true);
    expect(cardPassesLanguageFilter(paper, NO_ACADEMIC)).toBe(false);
  });
});
