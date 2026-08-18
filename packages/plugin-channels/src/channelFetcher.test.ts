/**
 * Purpose: unit tests for the fetch-discipline orchestration — replaying stored ETag and
 * Last-Modified on the next poll, handling 304, applying the size cap, and sending the compliant
 * or overridden User-Agent. Outcome handling is covered in channelFetcherOutcomes.test.ts.
 * No live network: the fetch implementation is injected.
 */
import { describe, expect, it, vi } from "vitest";
import type { ChannelSource } from "./channelCatalog";
import { ChannelFetcher } from "./channelFetcher";
import { FetchBudgetLedger } from "./fetchBudget";
import type { ConditionalRequestState, ConditionalRequestStore } from "./fetchContract";

const source: ChannelSource = {
  id: "sspai",
  displayName: "少数派",
  adapterType: "generic-feed",
  endpoint: { feedUrl: "https://sspai.com/feed" },
  language: "zh-CN",
  defaultKind: "article",
  tone: "both",
  defaultEnabled: true,
  fetchPolicy: {
    minimumIntervalMilliseconds: 60_000,
    dailyRequestBudget: 5,
    userAgentOverride: null,
  },
};

function memoryStore(): ConditionalRequestStore & { state: Map<string, ConditionalRequestState> } {
  const state = new Map<string, ConditionalRequestState>();
  return {
    state,
    read: async (sourceId) => state.get(sourceId) ?? null,
    write: async (sourceId, value) => {
      state.set(sourceId, value);
    },
  };
}

type FetchStub = (url: string, init: RequestInit) => Promise<Response>;

function stubFetch(handler: FetchStub) {
  return vi.fn<FetchStub>(handler);
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  if (!init) throw new Error("expected the fetcher to have issued a request");
  return (init.headers ?? {}) as Record<string, string>;
}

describe("ChannelFetcher conditional requests", () => {
  it("stores the validators from the first response and replays them on the next poll", async () => {
    const store = memoryStore();
    const fetchImplementation = vi
      .fn<FetchStub>()
      .mockResolvedValueOnce(
        new Response("<rss/>", {
          headers: { etag: 'W/"abc"', "last-modified": "Sat, 16 Aug 2026 08:30:00 GMT" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const ledger = new FetchBudgetLedger({ now: () => 0 });
    const fetcher = new ChannelFetcher({
      fetchImplementation,
      conditionalRequestStore: store,
      ledger,
    });

    const first = await fetcher.fetchSource(source);
    expect(first.status).toBe("fetched");
    expect(headersOf(fetchImplementation.mock.calls[0]?.[1])["If-None-Match"]).toBeUndefined();
    expect(store.state.get("sspai")).toEqual({
      etag: 'W/"abc"',
      lastModified: "Sat, 16 Aug 2026 08:30:00 GMT",
    });

    // Second poll: the interval has to be cleared first, otherwise discipline skips it.
    const unthrottled = new ChannelFetcher({
      fetchImplementation,
      conditionalRequestStore: store,
    });
    const second = await unthrottled.fetchSource(source);
    expect(second).toEqual({ status: "not-modified" });
    const replayed = headersOf(fetchImplementation.mock.calls[1]?.[1]);
    expect(replayed["If-None-Match"]).toBe('W/"abc"');
    expect(replayed["If-Modified-Since"]).toBe("Sat, 16 Aug 2026 08:30:00 GMT");
  });

  it("asks unconditionally when the stored row is malformed", async () => {
    const fetchImplementation = stubFetch(async () => new Response("<rss/>"));
    const fetcher = new ChannelFetcher({
      fetchImplementation,
      conditionalRequestStore: {
        read: async () => ({ etag: 42 }),
        write: async () => undefined,
      },
    });
    await fetcher.fetchSource(source);
    expect(headersOf(fetchImplementation.mock.calls[0]?.[1])["If-None-Match"]).toBeUndefined();
  });

  it("keeps the payload even when persisting the validators fails", async () => {
    const fetcher = new ChannelFetcher({
      fetchImplementation: async () => new Response("<rss/>"),
      conditionalRequestStore: {
        read: async () => {
          throw new Error("db closed");
        },
        write: async () => {
          throw new Error("db closed");
        },
      },
    });
    const outcome = await fetcher.fetchSource(source);
    expect(outcome.status).toBe("fetched");
  });
});

describe("ChannelFetcher headers and limits", () => {
  it("sends a contact-bearing User-Agent by default", async () => {
    const fetchImplementation = stubFetch(async () => new Response("<rss/>"));
    const fetcher = new ChannelFetcher({
      fetchImplementation,
      conditionalRequestStore: memoryStore(),
      appVersion: "1.2.3",
    });
    await fetcher.fetchSource(source);
    expect(headersOf(fetchImplementation.mock.calls[0]?.[1])["User-Agent"]).toBe(
      "Breadcrumb/1.2.3 (+https://github.com/Kali-Leo/Breadcrumb)",
    );
  });

  it("uses the per-source User-Agent override for sites that reject library agents", async () => {
    const fetchImplementation = stubFetch(async () => new Response("<rss/>"));
    const browserish = {
      ...source,
      fetchPolicy: { ...source.fetchPolicy, userAgentOverride: "Mozilla/5.0 (X11; Linux x86_64)" },
    };
    const fetcher = new ChannelFetcher({
      fetchImplementation,
      conditionalRequestStore: memoryStore(),
    });
    await fetcher.fetchSource(browserish);
    expect(headersOf(fetchImplementation.mock.calls[0]?.[1])["User-Agent"]).toBe(
      "Mozilla/5.0 (X11; Linux x86_64)",
    );
  });

  it("truncates an oversized body and says so", async () => {
    const fetcher = new ChannelFetcher({
      fetchImplementation: async () => new Response("x".repeat(5000)),
      conditionalRequestStore: memoryStore(),
      responseSizeCapBytes: 1000,
    });
    const outcome = await fetcher.fetchSource(source);
    expect(outcome).toMatchObject({ status: "fetched", truncated: true, byteLength: 1000 });
  });

  it("exposes the data-saver flag to adapters and lets settings flip it", () => {
    const fetcher = new ChannelFetcher({
      fetchImplementation: async () => new Response("<rss/>"),
      conditionalRequestStore: memoryStore(),
    });
    expect(fetcher.contextForSource(source).dataSaverEnabled).toBe(false);
    fetcher.setDataSaverEnabled(true);
    expect(fetcher.contextForSource(source).dataSaverEnabled).toBe(true);
  });
});
