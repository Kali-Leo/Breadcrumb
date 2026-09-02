/**
 * Purpose: unit tests for the Bing China provider — result-block parsing, ck-redirect
 * base64 decoding, the fetch-and-verify filter, the page-body evidence window, and the
 * failed/empty distinction the pipeline's fourth verdict state rests on (mocked fetch).
 */
import { describe, expect, it, vi } from "vitest";
import { createBingProvider } from "./bing";

const DIRECT_URL = "https://baike.example.com/光速";
const WRAPPED_URL = "https://physics.example.com/light";
const DEAD_URL = "https://example.com/dead";

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const RESULTS_HTML = `
<li class="b_algo"><h2><a href="${DIRECT_URL}">光速 - <b>百科</b></a></h2>
  <div class="b_caption"><p>光速是每秒 299792458 米。</p></div></li>
<li class="b_algo"><h2><a href="https://cn.bing.com/ck/a?u=a1${base64Url(WRAPPED_URL)}&h=x">Speed of light</a></h2>
  <div class="b_caption"><p>The speed of light in vacuum.</p></div></li>
<li class="b_algo"><h2><a href="${DEAD_URL}">Dead page</a></h2>
  <div class="b_caption"><p>This page is gone.</p></div></li>`;

describe("createBingProvider", () => {
  it("parses direct and ck-wrapped links, keeping only reachable pages", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("https://cn.bing.com/search")) {
        return new Response(RESULTS_HTML, { status: 200 });
      }
      if (url === DEAD_URL) return new Response("gone", { status: 404 });
      return new Response("ok", { status: 200 });
    });
    const provider = createBingProvider({ fetchImpl });

    const { items } = await provider.search("光速", 3);

    expect(items).toEqual([
      {
        url: DIRECT_URL,
        title: "光速 - 百科",
        snippet: "光速是每秒 299792458 米。",
        source: "bing",
      },
      {
        url: WRAPPED_URL,
        title: "Speed of light",
        snippet: "The speed of light in vacuum.",
        source: "bing",
      },
    ]);
  });

  it("passes an abort signal so blocked networks fail fast instead of hanging", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("", { status: 200 });
    });
    const provider = createBingProvider({ fetchImpl, timeoutMs: 1000 });

    expect(await provider.search("任意查询", 3)).toEqual({ items: [], failed: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("reports failed (not merely empty) when the search endpoint fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const provider = createBingProvider({ fetchImpl });

    expect(await provider.search("anything", 3)).toEqual({ items: [], failed: true });
  });

  it("reports failed when every candidate page turns out unreachable", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("https://cn.bing.com/search")) {
        return new Response(RESULTS_HTML, { status: 200 });
      }
      return new Response("gone", { status: 404 });
    });
    const provider = createBingProvider({ fetchImpl });

    expect(await provider.search("光速", 3)).toEqual({ items: [], failed: true });
  });

  it("judges on a window of the page body rather than the search summary", async () => {
    const body = `<html><body><script>var junk = "ignore me";</script><p>${"填充。".repeat(
      400,
    )}光速在真空中的数值是每秒 299792458 米，这一数值自 1983 年起成为定义值。${"补充。".repeat(
      400,
    )}</p></body></html>`;
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("https://cn.bing.com/search")) {
        return new Response(RESULTS_HTML, { status: 200 });
      }
      return new Response(body, { status: 200 });
    });
    const provider = createBingProvider({ fetchImpl });

    const { items } = await provider.search("光速", 1);

    expect(items[0]?.snippet).toContain("1983 年起成为定义值");
    expect(items[0]?.snippet).not.toContain("ignore me");
    expect(items[0]?.snippet.length).toBeLessThanOrEqual(1500);
  });

  it("parses a result block whose attribute order and whitespace differ from the fixture", () => {
    // A hand-written regex anchored on exact attribute order/spacing breaks the moment Bing
    // reorders attributes or reformats whitespace; cheerio's DOM traversal does not care.
    const reorderedHtml = `
<li
  class="b_algo"
><h2><a  target="_blank"   href="${DIRECT_URL}"  >光速
      - <b>百科</b></a></h2>
  <div class="b_caption">
    <p>
      光速是每秒 299792458 米。
    </p>
  </div>
</li>`;
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("https://cn.bing.com/search")) {
        return new Response(reorderedHtml, { status: 200 });
      }
      return new Response("ok", { status: 200 });
    });
    const provider = createBingProvider({ fetchImpl });

    return provider.search("光速", 1).then(({ items }) => {
      expect(items).toEqual([
        {
          url: DIRECT_URL,
          title: "光速 - 百科",
          snippet: "光速是每秒 299792458 米。",
          source: "bing",
        },
      ]);
    });
  });

  it("warns and reports failed when a 200 response yields zero candidates", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("<html></html>", { status: 200 }));
    const provider = createBingProvider({ fetchImpl });

    // Markup drift and a genuinely empty result set are indistinguishable from here, so the
    // provider claims the weaker of the two: the search did not complete.
    expect(await provider.search("anything", 3)).toEqual({ items: [], failed: true });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[factcheck:bing]"));
    warn.mockRestore();
  });
});
