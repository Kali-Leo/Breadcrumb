/**
 * Purpose: unit tests for the Wikipedia provider — search + summary flow, language
 * fallback, and silent failure on network errors (mocked fetch).
 */
import { describe, expect, it, vi } from "vitest";
import { createWikipediaProvider } from "./wikipedia";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("createWikipediaProvider", () => {
  it("returns a verified evidence item from search + summary", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ pages: [{ key: "Speed_of_light", title: "Speed of light" }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          title: "Speed of light",
          extract: "The speed of light is 299792458 m/s.",
          content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Speed_of_light" } },
        }),
      );
    const provider = createWikipediaProvider({ fetchImpl, languages: ["en"] });

    const items = await provider.search("speed of light", 3);

    expect(items).toEqual([
      {
        url: "https://en.wikipedia.org/wiki/Speed_of_light",
        title: "Speed of light",
        snippet: "The speed of light is 299792458 m/s.",
        source: "wikipedia",
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falls through to the next language when a search has no pages", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ pages: [] }))
      .mockResolvedValueOnce(jsonResponse({ pages: [{ key: "Closure", title: "Closure" }] }))
      .mockResolvedValueOnce(jsonResponse({ title: "Closure", extract: "A closure is..." }));
    const provider = createWikipediaProvider({ fetchImpl, languages: ["zh", "en"] });

    const items = await provider.search("closure", 1);

    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe("https://en.wikipedia.org/wiki/Closure");
  });

  it("returns [] when the network fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const provider = createWikipediaProvider({ fetchImpl, languages: ["zh", "en"] });

    expect(await provider.search("anything", 3)).toEqual([]);
  });
});
