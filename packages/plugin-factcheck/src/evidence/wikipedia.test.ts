/**
 * Purpose: unit tests for the Wikipedia provider — search + summary flow, the two hits taken
 * per language edition, language fallback, the Wikimedia-policy User-Agent headers, and the
 * failed/empty distinction on network errors (mocked fetch).
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

    const { items, failed } = await provider.search("speed of light", 3);

    expect(failed).toBe(false);
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

  it("takes the top two hits per language, not just the first", async () => {
    // A specific date or figure is rarely in the lead paragraph of the single best-ranked
    // article; the second hit is one extra summary request, not one extra search.
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          pages: [
            { key: "A", title: "A" },
            { key: "B", title: "B" },
            { key: "C", title: "C" },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ title: "A", extract: "First article." }))
      .mockResolvedValueOnce(jsonResponse({ title: "B", extract: "Second article." }));
    const provider = createWikipediaProvider({ fetchImpl, languages: ["en"] });

    const { items } = await provider.search("anything", 3);

    expect(items.map((item) => item.title)).toEqual(["A", "B"]);
  });

  it("sends both the standard and the API User-Agent header", async () => {
    const seenHeaders: unknown[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      seenHeaders.push(init?.headers);
      return jsonResponse({ pages: [] });
    });
    const provider = createWikipediaProvider({ fetchImpl, languages: ["en"] });

    await provider.search("anything", 1);

    expect(seenHeaders[0]).toEqual(
      expect.objectContaining({
        "User-Agent": expect.stringContaining("Breadcrumb"),
        "Api-User-Agent": expect.stringContaining("Breadcrumb"),
      }),
    );
  });

  it("falls through to the next language when a search has no pages", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ pages: [] }))
      .mockResolvedValueOnce(jsonResponse({ pages: [{ key: "Closure", title: "Closure" }] }))
      .mockResolvedValueOnce(jsonResponse({ title: "Closure", extract: "A closure is..." }));
    const provider = createWikipediaProvider({ fetchImpl, languages: ["zh", "en"] });

    const { items } = await provider.search("closure", 1);

    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe("https://en.wikipedia.org/wiki/Closure");
  });

  it("reports an empty (not failed) search when every edition answers with no pages", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ pages: [] }));
    const provider = createWikipediaProvider({ fetchImpl, languages: ["zh", "en"] });

    expect(await provider.search("anything", 3)).toEqual({ items: [], failed: false });
  });

  it("reports failed when every edition is unreachable", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const provider = createWikipediaProvider({ fetchImpl, languages: ["zh", "en"] });

    expect(await provider.search("anything", 3)).toEqual({ items: [], failed: true });
  });
});
