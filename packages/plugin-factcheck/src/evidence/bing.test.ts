/**
 * Purpose: unit tests for the Bing China provider — result-block parsing, ck-redirect
 * base64 decoding, and the fetch-and-verify filter (mocked fetch).
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

    const items = await provider.search("光速", 3);

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
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("", { status: 200 });
    });
    const provider = createBingProvider({ fetchImpl, timeoutMs: 1000 });

    expect(await provider.search("任意查询", 3)).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns [] when the search endpoint fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const provider = createBingProvider({ fetchImpl });

    expect(await provider.search("anything", 3)).toEqual([]);
  });
});
