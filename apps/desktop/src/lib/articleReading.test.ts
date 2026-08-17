/**
 * Purpose: unit tests for readCardArticle — spec 053's 断网重启 acceptance ("已缓存正文可读") read
 * as a sequence: the text kept on the card wins, a first read is extracted and then kept, and a
 * card with nothing kept and no network says so plainly instead of showing an error.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { afterEach, describe, expect, it, vi } from "vitest";

let storedBodies = new Map<string, string>();
const setCardBodyMock = vi.fn(async (id: string, bodyMd: string) => {
  storedBodies.set(id, bodyMd);
});

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({ discovery: { setCardBody: setCardBodyMock } })),
}));

let networkEnabled = true;
vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ networkEnabled }) },
}));

const noteCardBodyMock = vi.fn();
vi.mock("../stores/discoveryStore", () => ({
  useDiscoveryStore: { getState: () => ({ noteCardBody: noteCardBodyMock }) },
}));

const extractArticleAtMock = vi.fn();
vi.mock("./articleExtraction", () => ({ extractArticleAt: extractArticleAtMock }));

const { readCardArticle } = await import("./articleReading");

function card(overrides: Partial<DiscoveryCardRow> = {}): DiscoveryCardRow {
  return {
    id: "sspai:1",
    title: "为什么闭包能记住变量",
    hook: "一段摘要。",
    topic_label: "少数派",
    source: "explore",
    body_md: null,
    embedding_json: null,
    batch_id: "batch",
    created_at: "2026-08-17T00:00:00.000Z",
    opened_at: null,
    source_id: "sspai",
    kind: "article",
    url: "https://sspai.com/post/1",
    media_url: null,
    cover_url: null,
    author: null,
    published_at: "2026-08-17T00:00:00.000Z",
    saved_at: null,
    quality_score: null,
    upstream_signal: null,
    ...overrides,
  };
}

afterEach(() => {
  storedBodies = new Map();
  networkEnabled = true;
  setCardBodyMock.mockClear();
  noteCardBodyMock.mockClear();
  extractArticleAtMock.mockReset();
});

describe("readCardArticle", () => {
  it("keeps the text it extracted, so the same article opens again offline", async () => {
    extractArticleAtMock.mockResolvedValue({
      kind: "extracted",
      markdown: "# 闭包\n\n函数带走了它出生的作用域。",
      title: null,
      author: null,
    });

    const first = await readCardArticle(card());
    expect(first).toEqual({
      kind: "text",
      markdown: "# 闭包\n\n函数带走了它出生的作用域。",
      fromCache: false,
    });
    expect(storedBodies.get("sspai:1")).toBe("# 闭包\n\n函数带走了它出生的作用域。");
    expect(noteCardBodyMock).toHaveBeenCalledWith(
      "sspai:1",
      "# 闭包\n\n函数带走了它出生的作用域。",
    );

    // A week later, on a plane: the row carries what was kept, and nothing is fetched.
    networkEnabled = false;
    const second = await readCardArticle(card({ body_md: storedBodies.get("sspai:1") ?? null }));
    expect(second).toEqual({
      kind: "text",
      markdown: "# 闭包\n\n函数带走了它出生的作用域。",
      fromCache: true,
    });
    expect(extractArticleAtMock).toHaveBeenCalledTimes(1);
  });

  it("does not go back to the network for a card whose text it already has", async () => {
    const result = await readCardArticle(card({ body_md: "# 已经读过的正文" }));
    expect(result).toEqual({ kind: "text", markdown: "# 已经读过的正文", fromCache: true });
    expect(extractArticleAtMock).not.toHaveBeenCalled();
  });

  it("treats a body of nothing but whitespace as no body at all", async () => {
    extractArticleAtMock.mockResolvedValue({ kind: "failed" });
    const result = await readCardArticle(card({ body_md: "   \n  " }));
    expect(result).toEqual({ kind: "unreadable", offline: false });
    expect(extractArticleAtMock).toHaveBeenCalledTimes(1);
  });

  it("says plainly that the article needs a network when there is nothing kept", async () => {
    networkEnabled = false;
    const result = await readCardArticle(card());
    expect(result).toEqual({ kind: "unreadable", offline: true });
    expect(extractArticleAtMock).not.toHaveBeenCalled();
  });

  it("keeps nothing when the page could not be read here", async () => {
    extractArticleAtMock.mockResolvedValue({ kind: "failed" });
    const result = await readCardArticle(card());
    expect(result).toEqual({ kind: "unreadable", offline: false });
    expect(setCardBodyMock).not.toHaveBeenCalled();
  });

  it("still shows the text when keeping it fails", async () => {
    extractArticleAtMock.mockResolvedValue({
      kind: "extracted",
      markdown: "正文正文正文。",
      title: null,
      author: null,
    });
    setCardBodyMock.mockRejectedValueOnce(new Error("database is locked"));
    const result = await readCardArticle(card());
    expect(result).toEqual({ kind: "text", markdown: "正文正文正文。", fromCache: false });
  });

  it("does not try to read a card that has no address at all", async () => {
    const result = await readCardArticle(card({ url: null }));
    expect(result).toEqual({ kind: "unreadable", offline: false });
    expect(extractArticleAtMock).not.toHaveBeenCalled();
  });
});
