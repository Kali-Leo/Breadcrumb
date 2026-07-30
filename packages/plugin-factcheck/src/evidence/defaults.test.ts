/**
 * Purpose: unit tests for the default provider chains — mainland China gets
 * reachable-only sources, the global chain leads with Wikipedia.
 */
import { describe, expect, it, vi } from "vitest";
import { createDefaultEvidenceProviders } from "./defaults";

const fetchImpl = vi.fn<typeof fetch>();

describe("createDefaultEvidenceProviders", () => {
  it("uses only reachable sources on a mainland-China network", () => {
    const providers = createDefaultEvidenceProviders({ fetchImpl, mainlandChina: true });
    expect(providers.map((provider) => provider.name)).toEqual(["bing"]);
  });

  it("leads with Wikipedia elsewhere, with Bing and DuckDuckGo as fallbacks", () => {
    const providers = createDefaultEvidenceProviders({ fetchImpl, mainlandChina: false });
    expect(providers.map((provider) => provider.name)).toEqual(["wikipedia", "bing", "duckduckgo"]);
  });
});
