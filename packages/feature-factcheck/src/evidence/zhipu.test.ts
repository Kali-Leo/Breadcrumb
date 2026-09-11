/**
 * Purpose: unit tests for the Zhipu open-web provider (mocked fetch) — the request shape
 * (engine, domain preference, bearer key), the double-encoded link decode, the no-link drop,
 * the content cleanup, the language gate, and the failed/empty distinction.
 */
import { describe, expect, it, vi } from "vitest";
import {
  cleanZhipuContent,
  createZhipuSearchProvider,
  normalizeZhipuLink,
  zhipuSupportsLanguage,
} from "./zhipu";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("zhipuSupportsLanguage", () => {
  it("admits the scripts it was measured on and refuses the ones it garbled", () => {
    expect(zhipuSupportsLanguage("zh-CN")).toBe(true);
    expect(zhipuSupportsLanguage("en")).toBe(true);
    expect(zhipuSupportsLanguage("sw")).toBe(true);
    for (const code of ["hi", "bn", "ar", "ru", "es"])
      expect(zhipuSupportsLanguage(code)).toBe(false);
  });
});

describe("normalizeZhipuLink", () => {
  it("decodes a double-encoded link once and canonicalises it", () => {
    expect(normalizeZhipuLink("https://zh.wikipedia.org/zh-hans/%25E7%258F%25A0")).toBe(
      "https://zh.wikipedia.org/zh-hans/%E7%8F%A0",
    );
  });
  it("drops empty and non-http links", () => {
    expect(normalizeZhipuLink("")).toBeNull();
    expect(normalizeZhipuLink("javascript:alert(1)")).toBeNull();
    expect(normalizeZhipuLink("not a url")).toBeNull();
  });
});

describe("cleanZhipuContent", () => {
  it("undoes the literal x0a and the half-width CJK punctuation", () => {
    expect(cleanZhipuContent("第一句｡x0a第二句､第三句")).toBe("第一句。 第二句、第三句");
  });
});

describe("createZhipuSearchProvider", () => {
  it("posts the query with the measured engine and domain preference, keyed by bearer", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        search_result: [
          {
            title: "珠穆朗玛峰 - 维基百科",
            content: "中国和尼泊尔共同宣布珠穆朗玛峰雪面高程最新高度为8848.86公尺。",
            link: "https://zh.wikipedia.org/zh-hans/%25E7%258F%25A0",
          },
          { title: "公众号文章", content: "珠峰高度 8844.43 米", link: "" },
        ],
      }),
    );
    const provider = createZhipuSearchProvider({ fetchImpl, apiKey: "secret", language: "zh-CN" });

    const { items, failed } = await provider.search("珠穆朗玛峰 海拔", 3);

    expect(failed).toBe(false);
    expect(items).toEqual([
      {
        url: "https://zh.wikipedia.org/zh-hans/%E7%8F%A0",
        title: "珠穆朗玛峰 - 维基百科",
        snippet: "中国和尼泊尔共同宣布珠穆朗玛峰雪面高程最新高度为8848.86公尺。",
        source: "zhipu",
      },
    ]);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://open.bigmodel.cn/api/paas/v4/web_search");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer secret" });
    expect(JSON.parse(String(init?.body))).toEqual({
      search_engine: "search_pro_bing",
      search_query: "珠穆朗玛峰 海拔",
      count: 5,
      search_domain_filter: "zh.wikipedia.org",
    });
  });

  it("reports empty, not failed, on a completed search with nothing usable", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ search_result: [] }));
    const provider = createZhipuSearchProvider({ fetchImpl, apiKey: "k", language: "en" });
    expect(await provider.search("anything", 3)).toEqual({ items: [], failed: false });
  });

  it("reports failed on a refused request (a bad key, a quota) and on a network error", async () => {
    const refused = vi.fn<typeof fetch>(async () => jsonResponse({ error: "unauthorized" }, 401));
    expect(
      await createZhipuSearchProvider({ fetchImpl: refused, apiKey: "k", language: "en" }).search(
        "q",
        3,
      ),
    ).toEqual({ items: [], failed: true });
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    expect(
      await createZhipuSearchProvider({ fetchImpl: offline, apiKey: "k", language: "en" }).search(
        "q",
        3,
      ),
    ).toEqual({ items: [], failed: true });
  });
});
