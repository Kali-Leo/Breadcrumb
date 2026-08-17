/**
 * Purpose: the two doubles every adapter test needs — a catalog source and a FetchContext that
 * answers from a table of fixtures instead of the network, recording what was asked for. Kept out
 * of index.ts: this is test scaffolding, not part of the package's surface.
 * Main exports: fakeChannelSource, fakeFetchContext.
 */
import { type ChannelSource, channelSourceSchema } from "./channelCatalog";
import type { FetchContext, FetchOutcome, SourceRequestKind } from "./fetchContract";

export function fakeChannelSource(overrides: Partial<ChannelSource> = {}): ChannelSource {
  return channelSourceSchema.parse({
    id: "sample",
    displayName: "Sample",
    adapterType: "generic-feed",
    endpoint: { feedUrl: "https://example.com/feed" },
    language: "en",
    defaultKind: "article",
    defaultEnabled: true,
    fetchPolicy: {
      minimumIntervalMilliseconds: 60_000,
      dailyRequestBudget: 100,
      userAgentOverride: null,
    },
    ...overrides,
  });
}

export interface RecordedRequest {
  url: string;
  kind: SourceRequestKind;
  accept: string | undefined;
}

export interface FakeFetchContext {
  context: FetchContext;
  requests: RecordedRequest[];
}

function fetchedOutcome(body: string, finalUrl: string): FetchOutcome {
  return {
    status: "fetched",
    body,
    truncated: false,
    byteLength: body.length,
    finalUrl,
  };
}

/**
 * Answers each address from `bodies`; anything not in the table comes back as a failure, which is
 * how a real poll sees an endpoint that is down. Values may also be whole outcomes, for the tests
 * that need a 304 or a rate-limit skip.
 */
export function fakeFetchContext(
  bodies: Readonly<Record<string, string | FetchOutcome>>,
  overrides: Partial<Omit<FetchContext, "fetchUrl">> = {},
): FakeFetchContext {
  const requests: RecordedRequest[] = [];
  const context: FetchContext = {
    userAgent: "Breadcrumb/test (+https://example.invalid)",
    dataSaverEnabled: false,
    responseSizeCapBytes: 5 * 1024 * 1024,
    requestTimeoutMilliseconds: 20_000,
    ...overrides,
    fetchUrl: async (url, options) => {
      requests.push({
        url,
        kind: options?.kind ?? "follow-up",
        accept: options?.accept,
      });
      const answer = bodies[url];
      if (answer === undefined) {
        return { status: "failed", reason: "no fixture for this address", httpStatus: 404 };
      }
      return typeof answer === "string" ? fetchedOutcome(answer, url) : answer;
    },
  };
  return { context, requests };
}
