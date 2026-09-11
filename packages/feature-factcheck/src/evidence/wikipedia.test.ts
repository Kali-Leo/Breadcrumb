/**
 * Purpose: unit tests for the Wikipedia provider — full-text search + article extract flow,
 * the window cut around the search hit's own sentence, the `origin=*` every request must
 * carry, two hits per edition, language fallback, the snippet standing in when the extract
 * fails, and the failed/empty distinction (mocked fetch).
 */
import { describe, expect, it, vi } from "vitest";
import { EVIDENCE_WINDOW_LENGTH } from "./pageText";
import { createWikipediaProvider, windowAround } from "./wikipedia";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function searchResponse(hits: Array<{ pageid: number; title: string; snippet: string }>) {
  return jsonResponse({ query: { search: hits } });
}

function extractResponse(title: string, extract: string) {
  return jsonResponse({ query: { pages: [{ pageid: 1, ns: 0, title, extract }] } });
}

describe("createWikipediaProvider", () => {
  it("returns the article window around the search hit, from search + extract", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        searchResponse([
          {
            pageid: 15492,
            title: "珠穆朗瑪峰",
            snippet:
              '中国和尼泊尔共同宣布<span class="searchmatch">珠穆朗玛峰</span>雪面高程最新高度为8848.86公尺。',
          },
        ]),
      )
      .mockResolvedValueOnce(
        extractResponse("珠穆朗瑪峰", "珠穆朗玛峰是世界第一高峰，海拔8848.86米。"),
      );
    const provider = createWikipediaProvider({ fetchImpl, languages: ["zh"] });

    const { items, failed } = await provider.search("珠穆朗玛峰 海拔 8848.86", 3);

    expect(failed).toBe(false);
    expect(items).toEqual([
      {
        url: "https://zh.wikipedia.org/wiki/%E7%8F%A0%E7%A9%86%E6%9C%97%E7%91%AA%E5%B3%B0",
        title: "珠穆朗瑪峰",
        snippet: "珠穆朗玛峰是世界第一高峰，海拔8848.86米。",
        source: "wikipedia",
      },
    ]);
    for (const call of fetchImpl.mock.calls) {
      const url = new URL(String(call[0]));
      expect(url.searchParams.get("origin")).toBe("*");
      expect(url.host).toBe("zh.wikipedia.org");
    }
    expect(new URL(String(fetchImpl.mock.calls[0]?.[0])).searchParams.get("list")).toBe("search");
    expect(new URL(String(fetchImpl.mock.calls[1]?.[0])).searchParams.get("prop")).toBe("extracts");
  });

  it("takes the top two hits per edition", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        searchResponse([
          { pageid: 1, title: "A", snippet: "a" },
          { pageid: 2, title: "B", snippet: "b" },
          { pageid: 3, title: "C", snippet: "c" },
        ]),
      )
      .mockResolvedValueOnce(extractResponse("A", "First article."))
      .mockResolvedValueOnce(extractResponse("B", "Second article."));
    const provider = createWikipediaProvider({ fetchImpl, languages: ["en"] });
    const { items } = await provider.search("anything", 3);
    expect(items.map((item) => item.title)).toEqual(["A", "B"]);
  });

  it("keeps the hit with its own snippet when the extract cannot be fetched", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        searchResponse([{ pageid: 1, title: "A", snippet: "<b>the</b> figure is 42" }]),
      )
      .mockRejectedValueOnce(new Error("timeout"));
    const provider = createWikipediaProvider({ fetchImpl, languages: ["en"] });
    const { items, failed } = await provider.search("figure 42", 1);
    expect(failed).toBe(false);
    expect(items[0]?.snippet).toBe("the figure is 42");
  });

  it("falls through to the next edition when a search has no hits", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValueOnce(searchResponse([{ pageid: 9, title: "Closure", snippet: "x" }]))
      .mockResolvedValueOnce(extractResponse("Closure", "A closure is..."));
    const provider = createWikipediaProvider({ fetchImpl, languages: ["zh", "en"] });
    const { items } = await provider.search("closure", 1);
    expect(items[0]?.url).toBe("https://en.wikipedia.org/wiki/Closure");
  });

  it("reports empty (not failed) when every edition answers with no hits", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => searchResponse([]));
    const provider = createWikipediaProvider({ fetchImpl, languages: ["zh", "en"] });
    expect(await provider.search("anything", 3)).toEqual({ items: [], failed: false });
  });

  it("reports failed when every edition is unreachable", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const provider = createWikipediaProvider({ fetchImpl, languages: ["zh", "en"] });
    expect(await provider.search("anything", 3)).toEqual({ items: [], failed: true });
  });

  it("drops an edition code that could not be a hostname", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => searchResponse([]));
    const provider = createWikipediaProvider({ fetchImpl, languages: ["evil.example.com/", "en"] });
    await provider.search("x", 1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("windowAround", () => {
  it("cuts the window around the search hit's sentence inside a long article", () => {
    const filler = "背景。".repeat(600);
    const extract = `${filler}中国和尼泊尔共同宣布珠穆朗玛峰雪面高程最新高度为8848.86公尺。${filler}`;
    const window = windowAround(
      extract,
      '共同宣布<span class="searchmatch">珠穆朗玛峰</span>雪面高程最新高度为8848.86公尺',
      "无关 查询",
    );
    expect(window).toHaveLength(EVIDENCE_WINDOW_LENGTH);
    expect(window).toContain("8848.86公尺");
  });

  it("falls back to the query terms when the snippet cannot be located", () => {
    const extract = `${"x ".repeat(1000)}the speed of light is 299792458 m/s ${"y ".repeat(1000)}`;
    const window = windowAround(extract, "…unrelated snippet text here…", "299792458");
    expect(window).toContain("299792458");
  });

  it("returns null for an empty extract", () => {
    expect(windowAround("   ", "", "q")).toBeNull();
  });
});
