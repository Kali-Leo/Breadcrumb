/**
 * Purpose: unit tests for the reachability probe — HEAD when the host answers it, a small ranged
 * GET when it does not, a false verdict when nothing answers, and never an exception, because an
 * unreachable source is meant to be skipped silently.
 */
import { describe, expect, it, vi } from "vitest";
import type { ChannelSource } from "./channelCatalog";
import { probeSourceReachability, reachabilityResultSchema } from "./reachabilityProbe";

const source: ChannelSource = {
  id: "juejin",
  displayName: "掘金",
  adapterType: "generic-feed",
  endpoint: { feedUrl: "https://juejin.cn/rss" },
  language: "zh-CN",
  defaultKind: "article",
  tone: "both",
  defaultEnabled: true,
  fetchPolicy: {
    minimumIntervalMilliseconds: 1_800_000,
    dailyRequestBudget: 48,
    userAgentOverride: null,
  },
};

const checkedAt = new Date("2026-08-17T09:00:00.000Z");

type FetchStub = (url: string, init: RequestInit) => Promise<Response>;

function stubFetch(handler: FetchStub) {
  return vi.fn<FetchStub>(handler);
}

function initOf(init: RequestInit | undefined): RequestInit {
  if (!init) throw new Error("expected the probe to have issued a request");
  return init;
}

describe("probeSourceReachability", () => {
  it("accepts a source that answers HEAD and asks nothing more", async () => {
    const fetchImplementation = stubFetch(async () => new Response(null, { status: 200 }));
    const result = await probeSourceReachability(source, {
      fetchImplementation,
      now: () => checkedAt,
    });
    expect(result).toEqual({
      sourceId: "juejin",
      reachable: true,
      checkedAt: checkedAt.toISOString(),
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(initOf(fetchImplementation.mock.calls[0]?.[1]).method).toBe("HEAD");
    expect(reachabilityResultSchema.parse(result)).toEqual(result);
  });

  it("falls back to a ranged GET when HEAD is not allowed", async () => {
    const fetchImplementation = vi
      .fn<FetchStub>()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response("<rss/>", { status: 206 }));
    const result = await probeSourceReachability(source, {
      fetchImplementation,
      now: () => checkedAt,
    });
    expect(result.reachable).toBe(true);
    const getInit = initOf(fetchImplementation.mock.calls[1]?.[1]);
    expect(getInit.method).toBe("GET");
    expect((getInit.headers as Record<string, string>).Range).toBe("bytes=0-1023");
  });

  it("reports unreachable rather than throwing when the transport fails", async () => {
    const result = await probeSourceReachability(source, {
      fetchImplementation: async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      },
      now: () => checkedAt,
    });
    expect(result).toEqual({
      sourceId: "juejin",
      reachable: false,
      checkedAt: checkedAt.toISOString(),
    });
  });

  it("reports unreachable when both attempts return an error status", async () => {
    const result = await probeSourceReachability(source, {
      fetchImplementation: async () => new Response(null, { status: 403 }),
      now: () => checkedAt,
    });
    expect(result.reachable).toBe(false);
  });

  it("uses the per-source User-Agent override when the site demands one", async () => {
    const fetchImplementation = stubFetch(async () => new Response(null, { status: 200 }));
    const browserish = {
      ...source,
      fetchPolicy: { ...source.fetchPolicy, userAgentOverride: "Mozilla/5.0 (X11; Linux x86_64)" },
    };
    await probeSourceReachability(browserish, { fetchImplementation, now: () => checkedAt });
    const headers = initOf(fetchImplementation.mock.calls[0]?.[1]).headers as Record<
      string,
      string
    >;
    expect(headers["User-Agent"]).toBe("Mozilla/5.0 (X11; Linux x86_64)");
  });
});
