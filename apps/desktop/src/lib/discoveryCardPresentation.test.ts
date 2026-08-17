import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import {
  readerModeForCard,
  sourceAndAuthorLine,
  sourceDisplayName,
} from "./discoveryCardPresentation";

function makeCard(overrides: Partial<DiscoveryCardRow> = {}): DiscoveryCardRow {
  return {
    id: "card-1",
    title: "一篇文章",
    hook: "开头一句",
    topic_label: "少数派",
    source: "explore",
    body_md: null,
    embedding_json: null,
    batch_id: "batch-1",
    created_at: "2026-08-17T00:00:00.000Z",
    opened_at: null,
    source_id: "sspai",
    kind: "article",
    url: "https://sspai.com/post/1",
    cover_url: null,
    author: null,
    published_at: "2026-08-16T00:00:00.000Z",
    saved_at: null,
    quality_score: null,
    upstream_signal: null,
    media_url: null,
    ...overrides,
  };
}

describe("readerModeForCard", () => {
  it("sends a card with no source to the self-generated reading pane", () => {
    expect(readerModeForCard(makeCard({ source_id: null, kind: null, url: null }))).toBe(
      "generated",
    );
  });

  it("sends a YouTube or bilibili link to the video player", () => {
    const youtube = makeCard({ kind: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    const bilibili = makeCard({
      kind: "video",
      url: "https://www.bilibili.com/video/BV1GJ411x7h7",
    });
    expect(readerModeForCard(youtube)).toBe("video");
    expect(readerModeForCard(bilibili)).toBe("video");
  });

  it("reads a video we cannot embed as a page instead of showing an empty player", () => {
    const card = makeCard({ kind: "video", url: "https://vimeo.com/12345" });
    expect(readerModeForCard(card)).toBe("article");
  });

  it("sends podcast episodes to the audio player", () => {
    expect(readerModeForCard(makeCard({ kind: "podcast" }))).toBe("podcast");
  });

  it("reads articles, papers and discussions in the same pane", () => {
    for (const kind of ["article", "paper", "discussion"] as const) {
      expect(readerModeForCard(makeCard({ kind })), kind).toBe("article");
    }
  });
});

describe("sourceDisplayName", () => {
  it("uses the name the shipped source list gives", () => {
    expect(sourceDisplayName(makeCard())).toBe("少数派");
  });

  it("falls back to the site's own address for a source the reader added", () => {
    const card = makeCard({ source_id: "custom-1", url: "https://www.example.org/posts/7" });
    expect(sourceDisplayName(card)).toBe("example.org");
  });

  it("has no source name for the self-generated cards", () => {
    expect(sourceDisplayName(makeCard({ source_id: null, url: null }))).toBeNull();
  });
});

describe("sourceAndAuthorLine", () => {
  it("joins source and author with a middle dot", () => {
    expect(sourceAndAuthorLine(makeCard({ author: "张三" }))).toBe("少数派 · 张三");
  });

  it("drops the half that is missing", () => {
    expect(sourceAndAuthorLine(makeCard())).toBe("少数派");
    expect(sourceAndAuthorLine(makeCard({ source_id: null, url: null, author: "张三" }))).toBe(
      "张三",
    );
  });

  it("does not repeat a name that is both the source and the author", () => {
    const card = makeCard({
      source_id: "custom-1",
      url: "https://blog.test/1",
      author: "blog.test",
    });
    expect(sourceAndAuthorLine(card)).toBe("blog.test");
  });

  it("says nothing when neither is known", () => {
    expect(sourceAndAuthorLine(makeCard({ source_id: null, url: null }))).toBeNull();
  });
});
