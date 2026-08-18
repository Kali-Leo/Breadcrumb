/**
 * Purpose: unit tests for the channel_state glue — a source in backoff or out of today's budget
 * is skipped in silence and comes back on its own, and one poll's outcome is written down so a
 * restart does not start hammering a dead channel from scratch.
 */
import type { ChannelStateRow } from "@breadcrumb/core-db";
import type { ChannelSource, SourceFetchResult } from "@breadcrumb/plugin-channels";
import { afterEach, describe, expect, it, vi } from "vitest";

let stateRows: ChannelStateRow[] = [];
const upsertMock = vi.fn(async (row: ChannelStateRow) => {
  stateRows = [...stateRows.filter((existing) => existing.source_id !== row.source_id), row];
});

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    channelState: {
      get: async (sourceId: string) => stateRows.find((row) => row.source_id === sourceId) ?? null,
      listAll: async () => stateRows,
      upsert: upsertMock,
    },
  })),
}));

const { isSourceAvailableNow, localDayKey, recordSourceFetch } = await import(
  "./discoveryChannelState"
);

const NOW = new Date("2026-08-17T10:00:00.000Z");

function source(overrides: Partial<ChannelSource> = {}): ChannelSource {
  return {
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
      dailyRequestBudget: 24,
      userAgentOverride: null,
    },
    ...overrides,
  };
}

function state(overrides: Partial<ChannelStateRow> = {}): ChannelStateRow {
  return {
    source_id: "sspai",
    etag: null,
    last_modified: null,
    last_fetch_at: null,
    reachable: null,
    failure_count: 0,
    daily_budget_used: 0,
    budget_day: null,
    ...overrides,
  };
}

function result(overrides: Partial<SourceFetchResult> = {}): SourceFetchResult {
  return {
    sourceId: "sspai",
    outcome: { status: "fetched", body: "", truncated: false, byteLength: 0, finalUrl: "u" },
    items: [],
    skippedEntryCount: 0,
    parseError: null,
    repairedFromTruncation: false,
    followUpRequestCount: 0,
    ...overrides,
  };
}

afterEach(() => {
  stateRows = [];
  upsertMock.mockClear();
});

describe("isSourceAvailableNow", () => {
  it("tries a source it has never fetched", () => {
    expect(isSourceAvailableNow(source(), undefined, NOW)).toBe(true);
  });

  it("waits out the backoff of a source that has been failing", () => {
    const justFailed = state({
      failure_count: 3,
      last_fetch_at: new Date(NOW.getTime() - 60_000).toISOString(),
    });
    expect(isSourceAvailableNow(source(), justFailed, NOW)).toBe(false);
  });

  it("tries a failing source again once its backoff has passed", () => {
    const failedLongAgo = state({
      failure_count: 3,
      last_fetch_at: new Date(NOW.getTime() - 7 * 60 * 60 * 1000).toISOString(),
    });
    expect(isSourceAvailableNow(source(), failedLongAgo, NOW)).toBe(true);
  });

  /** Spec 053 T9 finding #9: the interval has to hold across restocks and restarts, not only
   * inside one fetcher's in-memory ledger. */
  it("waits out the minimum interval after a poll that worked", () => {
    const justPolled = state({
      failure_count: 0,
      last_fetch_at: new Date(NOW.getTime() - 30_000).toISOString(),
    });
    expect(isSourceAvailableNow(source(), justPolled, NOW)).toBe(false);
  });

  it("polls again once the minimum interval has passed", () => {
    const polledLongEnoughAgo = state({
      failure_count: 0,
      last_fetch_at: new Date(NOW.getTime() - 90_000).toISOString(),
    });
    expect(isSourceAvailableNow(source(), polledLongEnoughAgo, NOW)).toBe(true);
  });

  it("stops at today's request budget and starts again tomorrow", () => {
    const spent = state({ daily_budget_used: 24, budget_day: localDayKey(NOW) });
    expect(isSourceAvailableNow(source(), spent, NOW)).toBe(false);
    const yesterday = state({ daily_budget_used: 24, budget_day: "2026-08-16" });
    expect(isSourceAvailableNow(source(), yesterday, NOW)).toBe(true);
  });

  it("never polls a catalog template the reader has not filled in", () => {
    const template = source({
      templateParameters: [{ name: "userId", label: "豆瓣 ID" }],
    });
    expect(isSourceAvailableNow(template, undefined, NOW)).toBe(false);
  });
});

describe("recordSourceFetch", () => {
  it("marks a source that answered as reachable and clears its failure streak", async () => {
    stateRows = [state({ failure_count: 4 })];
    await recordSourceFetch(result(), NOW);
    expect(stateRows[0]).toMatchObject({
      reachable: 1,
      failure_count: 0,
      daily_budget_used: 1,
      budget_day: localDayKey(NOW),
    });
  });

  it("counts a 304 as an answer — the source is alive, it just has nothing new", async () => {
    await recordSourceFetch(result({ outcome: { status: "not-modified" } }), NOW);
    expect(stateRows[0]?.reachable).toBe(1);
  });

  it("lengthens the failure streak when a source does not answer", async () => {
    stateRows = [state({ failure_count: 1 })];
    await recordSourceFetch(
      result({ outcome: { status: "failed", reason: "timeout", httpStatus: null } }),
      NOW,
    );
    expect(stateRows[0]).toMatchObject({ reachable: 0, failure_count: 2 });
  });

  it("charges the follow-up requests a poll needed to the same day's budget", async () => {
    await recordSourceFetch(result({ followUpRequestCount: 4 }), NOW);
    expect(stateRows[0]?.daily_budget_used).toBe(5);
  });

  it("spends nothing for a request that never left", async () => {
    stateRows = [state({ daily_budget_used: 3, budget_day: localDayKey(NOW) })];
    await recordSourceFetch(
      result({ outcome: { status: "skipped", reason: "minimum-interval" } }),
      NOW,
    );
    expect(stateRows[0]?.daily_budget_used).toBe(3);
    expect(stateRows[0]?.last_fetch_at).toBeNull();
  });

  it("starts a new day's budget from zero", async () => {
    stateRows = [state({ daily_budget_used: 20, budget_day: "2026-08-16" })];
    await recordSourceFetch(result(), NOW);
    expect(stateRows[0]).toMatchObject({ daily_budget_used: 1, budget_day: localDayKey(NOW) });
  });
});
