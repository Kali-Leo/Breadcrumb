/**
 * Purpose: the language filter as the grid actually meets it (spec 054) — the ranking pass reads
 * the reader's languages and hands back only cards in them, keeps papers whatever they are
 * written in, and keeps anything too short or too mixed to judge. Also the point of the choice
 * living here: switching another language on brings cards already in the pool back without
 * anything being re-fetched.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { describe, expect, it, vi } from "vitest";
import type { FeedLanguagePolicy } from "./discoveryLanguages";

let pool: DiscoveryCardRow[] = [];
let policy: FeedLanguagePolicy = {
  enabledLanguages: ["zh"],
  academicContentEnabled: true,
  readerChosenSourceIds: [],
};

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
