/**
 * Purpose: unit tests for the evidence route — edition × mainland × language × key decide
 * which providers run and in what order, and the one case with no source at all is an empty
 * route rather than a pretend one.
 */
import { describe, expect, it, vi } from "vitest";
import { createDefaultEvidenceProviders, type DefaultProvidersOptions } from "./defaults";

const fetchImpl = vi.fn<typeof fetch>();

function route(overrides: Partial<DefaultProvidersOptions>): string[] {
  return createDefaultEvidenceProviders({
    fetchImpl,
    edition: "desktop",
    mainlandChina: false,
    language: "zh-CN",
    ...overrides,
  }).map((provider) => provider.name);
}

describe("createDefaultEvidenceProviders", () => {
  it("desktop, open network: structured → prose → scraping, no key needed", () => {
    expect(route({})).toEqual(["wikidata", "wikipedia", "bing", "duckduckgo"]);
  });

  it("desktop, open network, with a key: the open-web layer slots in after the free ones", () => {
    expect(route({ webSearchApiKey: "k" })).toEqual([
      "wikidata",
      "wikipedia",
      "zhipu",
      "bing",
      "duckduckgo",
    ]);
  });

  it("desktop, mainland: the Wikimedia layers are skipped, Bing CN stays", () => {
    expect(route({ mainlandChina: true })).toEqual(["bing"]);
    expect(route({ mainlandChina: true, webSearchApiKey: "k" })).toEqual(["zhipu", "bing"]);
  });

  it("browser, open network: only the CORS-open endpoints", () => {
    expect(route({ edition: "browser" })).toEqual(["wikidata", "wikipedia"]);
    expect(route({ edition: "browser", webSearchApiKey: "k" })).toEqual([
      "wikidata",
      "wikipedia",
      "zhipu",
    ]);
  });

  it("browser, mainland: the keyed layer or nothing — an empty route, never a fake one", () => {
    expect(route({ edition: "browser", mainlandChina: true })).toEqual([]);
    expect(route({ edition: "browser", mainlandChina: true, webSearchApiKey: "k" })).toEqual([
      "zhipu",
    ]);
  });

  it("keeps the open-web layer away from the scripts it was measured to fail on", () => {
    for (const language of ["hi", "bn", "ar"]) {
      expect(route({ edition: "browser", language, webSearchApiKey: "k" })).toEqual([
        "wikidata",
        "wikipedia",
      ]);
    }
    expect(route({ edition: "browser", language: "sw", webSearchApiKey: "k" })).toContain("zhipu");
  });

  it("treats a blank key as no key", () => {
    expect(route({ edition: "browser", webSearchApiKey: "   " })).toEqual([
      "wikidata",
      "wikipedia",
    ]);
  });
});
