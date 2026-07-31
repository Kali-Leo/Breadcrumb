/**
 * Purpose: unit tests for the DuckDuckGo provider — HTML parsing, redirect decoding,
 * and the fetch-and-verify filter that drops unreachable pages (mocked fetch).
 */
import { describe, expect, it, vi } from "vitest";
import { createDuckDuckGoProvider } from "./duckduckgo";

const REACHABLE_URL = "https://example.com/light";
const DEAD_URL = "https://example.com/dead";

const RESULTS_HTML = `
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(REACHABLE_URL)}">Speed of <b>light</b></a>
  <a class="result__snippet" href="#">The speed of light is 299792458 m/s.</a>
</div>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(DEAD_URL)}">Dead page</a>
  <a class="result__snippet" href="#">This page is gone.</a>
</div>`;

describe("createDuckDuckGoProvider", () => {
  it("decodes redirect links and keeps only reachable pages", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("https://html.duckduckgo.com/")) {
        return new Response(RESULTS_HTML, { status: 200 });
      }
      if (url === REACHABLE_URL) return new Response("ok", { status: 200 });
      return new Response("gone", { status: 404 });
    });
    const provider = createDuckDuckGoProvider({ fetchImpl });

    const items = await provider.search("speed of light", 3);

    expect(items).toEqual([
      {
        url: REACHABLE_URL,
        title: "Speed of light",
        snippet: "The speed of light is 299792458 m/s.",
        source: "duckduckgo",
      },
    ]);
  });

  it("returns [] when the search endpoint fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const provider = createDuckDuckGoProvider({ fetchImpl });

    expect(await provider.search("anything", 3)).toEqual([]);
  });
});
