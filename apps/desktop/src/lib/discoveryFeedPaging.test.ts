/**
 * Purpose: the two filters as the grid actually meets them (spec 054) — the ranking pass reads the
 * reader's languages and hands back only cards in them, keeps papers whatever they are written in,
 * and keeps anything too short or too mixed to judge; and it reads the 休闲/专业 mode and hands back
 * only the sources that belong in it. Also the point of both choices living here: changing one
 * brings cards already in the pool back or holds them without anything being re-fetched.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { describe, expect, it, vi } from "vitest";
import type { FeedModePolicy } from "./discoveryFeedMode";
import type { FeedLanguagePolicy } from "./discoveryLanguages";

let pool: DiscoveryCardRow[] = [];
let policy: FeedLanguagePolicy = {
  enabledLanguages: ["zh"],
  academicContentEnabled: true,
  readerChosenSourceIds: [],
};
let modePolicy: FeedModePolicy = { mode: "casual", readerChosenSourceIds: [] };

vi.mock("./db", () => ({
  getRepos: async () => ({
    discovery: {
      listUnseenPoolCards: async () => pool,
      listAllEvents: async () => [],
    },
  }),
}));

vi.mock("../stores/discoveryChannelSettingsStore", () => ({
  ensureFeedLanguagePolicyLoaded: async () => policy,
  ensureFeedModePolicyLoaded: async () => modePolicy,
}));

const { rankUnshownPoolCards } = await import("./discoveryFeedPaging");

function card(
  id: string,
  title: string,
  hook: string,
  kind: DiscoveryCardRow["kind"] = "article",
): DiscoveryCardRow {
  return {
    id,
    title,
    hook,
    topic_label: "测试",
    source: "explore",
    body_md: null,
    embedding_json: null,
    batch_id: "batch",
    created_at: "2026-08-18T00:00:00.000Z",
    opened_at: null,
    source_id: "test-source",
    kind,
    url: "https://example.org/item",
    cover_url: null,
    author: null,
    published_at: "2026-08-18T00:00:00.000Z",
    saved_at: null,
    quality_score: null,
    upstream_signal: null,
    media_url: null,
  };
}

const CHINESE = card("zh-1", "睡眠与记忆", "研究人员发现睡眠对记忆的巩固有直接影响。");
const ENGLISH = card(
  "en-1",
  "Sleep and memory",
  "Researchers found that sleep directly shapes how memory settles overnight.",
);
const JAPANESE = card("ja-1", "今日の一枚", "この写真は昨日の夕方に撮影されたものです。");
const PAPER = card(
  "paper-1",
  "Scaling laws for neural language models",
  "We study empirical scaling laws for language model performance on the cross-entropy loss.",
  "paper",
);
const TOO_SHORT = card("short-1", "Framatube", "");

async function rankedIds(): Promise<string[]> {
  const ranked = await rankUnshownPoolCards(new Set(), 0.3);
  return ranked.map((row) => row.id).sort();
}

describe("the ranking pass and the reader's languages", () => {
  it("hands the grid the chosen language, the papers and the cards it cannot judge", async () => {
    pool = [CHINESE, ENGLISH, JAPANESE, PAPER, TOO_SHORT];
    policy = { enabledLanguages: ["zh"], academicContentEnabled: true, readerChosenSourceIds: [] };
    expect(await rankedIds()).toEqual(["paper-1", "short-1", "zh-1"]);
  });

  it("brings the pool's other-language cards back the moment that language is switched on", async () => {
    pool = [CHINESE, ENGLISH, JAPANESE, PAPER, TOO_SHORT];
    policy = {
      enabledLanguages: ["zh", "en"],
      academicContentEnabled: true,
      readerChosenSourceIds: [],
    };
    expect(await rankedIds()).toEqual(["en-1", "paper-1", "short-1", "zh-1"]);
  });

  it("hands back nothing rather than the wrong language when the pool holds only the wrong one", async () => {
    pool = [ENGLISH, JAPANESE];
    policy = { enabledLanguages: ["zh"], academicContentEnabled: true, readerChosenSourceIds: [] };
    expect(await rankedIds()).toEqual([]);
  });
});

/** Spec 054, Leo's eighth point. The catalog ids below are real ones: 掘金 is a developer site,
 * 小众软件 is a browsing one, 少数派 serves both moods and belongs in both modes. */
function cardFrom(id: string, sourceId: string, kind: DiscoveryCardRow["kind"] = "article") {
  return {
    ...card(id, "关于学习的一篇文章", "这篇文章讲的是学习方法和记忆的关系。", kind),
    source_id: sourceId,
  };
}

const FROM_PROFESSIONAL = cardFrom("pro-1", "juejin");
const FROM_CASUAL = cardFrom("casual-1", "appinn");
const FROM_BOTH = cardFrom("both-1", "sspai");
const FROM_PAPER = cardFrom("paper-2", "arxiv-cs-ai", "paper");

describe("the ranking pass and the reader's mode", () => {
  it("shows the browsing sources and the ones that serve both when the reader is 休闲", async () => {
    pool = [FROM_PROFESSIONAL, FROM_CASUAL, FROM_BOTH];
    policy = { enabledLanguages: ["zh"], academicContentEnabled: true, readerChosenSourceIds: [] };
    modePolicy = { mode: "casual", readerChosenSourceIds: [] };
    expect(await rankedIds()).toEqual(["both-1", "casual-1"]);
  });

  it("shows the working sources and the ones that serve both when the reader is 专业", async () => {
    pool = [FROM_PROFESSIONAL, FROM_CASUAL, FROM_BOTH];
    modePolicy = { mode: "professional", readerChosenSourceIds: [] };
    expect(await rankedIds()).toEqual(["both-1", "pro-1"]);
  });

  it("keeps a channel the reader switched on by hand in whichever mode they are in", async () => {
    pool = [FROM_PROFESSIONAL, FROM_CASUAL];
    modePolicy = { mode: "casual", readerChosenSourceIds: ["juejin"] };
    expect(await rankedIds()).toEqual(["casual-1", "pro-1"]);
  });

  it("shows a card off a feed the reader pasted in, which belongs to no mode", async () => {
    pool = [cardFrom("pasted-1", "user-feed:https://blog.example.org/atom.xml")];
    modePolicy = { mode: "professional", readerChosenSourceIds: [] };
    expect(await rankedIds()).toEqual(["pasted-1"]);
  });
});

describe("the ranking pass and the 学术内容 switch", () => {
  it("stops handing over papers once it is switched off, and brings them back when it is on", async () => {
    pool = [FROM_BOTH, FROM_PAPER];
    modePolicy = { mode: "professional", readerChosenSourceIds: [] };
    policy = { enabledLanguages: ["zh"], academicContentEnabled: false, readerChosenSourceIds: [] };
    expect(await rankedIds()).toEqual(["both-1"]);
    policy = { enabledLanguages: ["zh"], academicContentEnabled: true, readerChosenSourceIds: [] };
    expect(await rankedIds()).toEqual(["both-1", "paper-2"]);
  });
});
