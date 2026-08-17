/**
 * Purpose: unit tests for the outcomes a poll can end in — a disabled source, a source still
 * inside its minimum interval, a transport error that arms the backoff, and an HTTP error status.
 * None of them may throw: one dead source must not break the round.
 */
import { describe, expect, it, vi } from "vitest";
import type { ChannelSource } from "./channelCatalog";
import { ChannelFetcher } from "./channelFetcher";
import type { ConditionalRequestState, ConditionalRequestStore } from "./fetchContract";

const source: ChannelSource = {
  id: "sspai",
  displayName: "少数派",
  adapterType: "generic-feed",
  endpoint: { feedUrl: "https://sspai.com/feed" },
  language: "zh-CN",
  defaultKind: "article",
  defaultEnabled: true,
  fetchPolicy: {
    minimumIntervalMilliseconds: 60_000,
    dailyRequestBudget: 5,
    userAgentOverride: null,
  },
};

function memoryStore(): ConditionalRequestStore {
  const state = new Map<string, ConditionalRequestState>();
  return {
    read: async (sourceId) => state.get(sourceId) ?? null,
    write: async (sourceId, value) => {
      state.set(sourceId, value);
    },
  };
}

describe("ChannelFetcher outcomes", () => {
  it("reports a disabled source as skipped without touching the network", async () => {
    const fetchImplementation = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response("<rss/>"),
    );
    const fetcher = new ChannelFetcher({
      fetchImplementation,
      conditionalRequestStore: memoryStore(),
    });
    expect(await fetcher.fetchSource(source, false)).toEqual({
      status: "skipped",
      reason: "source-disabled",
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("skips a second poll inside the minimum interval", async () => {
    const fetcher = new ChannelFetcher({
      fetchImplementation: async () => new Response("<rss/>"),
      conditionalRequestStore: memoryStore(),
    });
    await fetcher.fetchSource(source);
    expect(await fetcher.fetchSource(source)).toEqual({
      status: "skipped",
      reason: "minimum-interval",
    });
  });

  it("turns a transport error into a failed outcome and arms the backoff", async () => {
    const fetcher = new ChannelFetcher({
      fetchImplementation: async () => {
        throw new Error("network unreachable");
      },
      conditionalRequestStore: memoryStore(),
    });
    expect(await fetcher.fetchSource(source)).toEqual({
      status: "failed",
      reason: "network unreachable",
      httpStatus: null,
    });
    expect(fetcher.ledger.snapshot("sspai").consecutiveFailureCount).toBe(1);
  });

  it("reports an HTTP error status without throwing", async () => {
    const fetcher = new ChannelFetcher({
      fetchImplementation: async () => new Response("nope", { status: 503 }),
      conditionalRequestStore: memoryStore(),
    });
    expect(await fetcher.fetchSource(source)).toMatchObject({
      status: "failed",
      httpStatus: 503,
    });
  });
});
