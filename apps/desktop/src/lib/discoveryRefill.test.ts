/**
 * Purpose: unit tests for refillDiscoveryPool — the high/low watermark (a stocked pool costs no
 * request, a thin one restocks, dislikes count as consumed), active recall only when polling
 * left the pool short, the daily query budget, landing idempotence across two restocks, and the
 * silent outcome when networking is off or nothing out there answers. The channel layer is
 * mocked; landing, recall and the pool arithmetic all run for real.
 */
import type { ChannelStateRow, DiscoveryCardRow, DiscoveryEventRow } from "@breadcrumb/core-db";
import type { CandidateItem } from "@breadcrumb/plugin-channels";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let cardRows: DiscoveryCardRow[] = [];
let eventRows: DiscoveryEventRow[] = [];
let settingRows = new Map<string, unknown>();
let channelStateRows: ChannelStateRow[] = [];

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    discovery: {
      countUnseenPoolCards: async () => cardRows.filter((row) => row.opened_at === null).length,
      listAllEvents: async () => eventRows,
      listNewestCards: async (limit: number) => cardRows.slice(0, limit),
      listCardIds: async () => cardRows.map((row) => row.id),
      insertCards: async (rows: readonly DiscoveryCardRow[]) => {
        cardRows.push(...rows);
      },
      deleteUnseenCardsLandedBefore: async (cutoffIso: string) => {
        cardRows = cardRows.filter(
          (row) => row.opened_at !== null || row.saved_at !== null || row.created_at >= cutoffIso,
        );
      },
      trimUnseenPoolTo: async (limit: number) => {
        const untouched = cardRows.filter((row) => row.opened_at === null && row.saved_at === null);
        const dropped = new Set(untouched.slice(limit).map((row) => row.id));
        cardRows = cardRows.filter((row) => !dropped.has(row.id));
      },
    },
    channelState: {
      listAll: async () => channelStateRows,
    },
    settings: {
      get: async <Value>(key: string) => (settingRows.get(key) ?? null) as Value | null,
      set: async (key: string, value: unknown) => {
        settingRows.set(key, value);
      },
    },
  })),
}));

let networkEnabled = true;
vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ networkEnabled }) },
}));

const pollChannelsForCandidatesMock = vi.fn();
const searchChannelsForCandidatesMock = vi.fn();
vi.mock("./discoveryChannels", () => ({
  pollChannelsForCandidates: pollChannelsForCandidatesMock,
  searchChannelsForCandidates: searchChannelsForCandidatesMock,
}));

const runBackgroundPassesMock = vi.fn(async () => {});
vi.mock("./discoveryBackgroundPasses", () => ({
  runBackgroundPasses: runBackgroundPassesMock,
}));

const { POOL_LOW_WATERMARK, refillDiscoveryPool } = await import("./discoveryRefill");

const NOW = new Date("2026-08-17T10:00:00.000Z");

function candidate(id: string): CandidateItem {
  return {
    id,
    sourceId: "hacker-news-front-page",
    kind: "discussion",
    url: `https://example.org/${id}`,
    title: `title ${id}`,
    summary: "摘要",
    coverUrl: null,
    author: null,
    publishedAt: "2026-08-17T09:00:00.000Z",
    upstreamSignal: 0.4,
    mediaUrl: null,
  };
}

function pooledCard(id: string, overrides: Partial<DiscoveryCardRow> = {}): DiscoveryCardRow {
  return {
    id,
    title: `pooled ${id}`,
    hook: "hook",
    topic_label: "编译器",
    source: "explore",
    body_md: null,
    embedding_json: null,
    batch_id: "batch",
    created_at: "2026-08-16T00:00:00.000Z",
    opened_at: null,
    source_id: "hacker-news-front-page",
    kind: "discussion",
    url: `https://example.org/${id}`,
    cover_url: null,
    author: null,
    published_at: "2026-08-16T00:00:00.000Z",
    saved_at: null,
    quality_score: null,
    upstream_signal: null,
    media_url: null,
    ...overrides,
  };
}

function fillPool(count: number): void {
  for (let index = 0; index < count; index += 1) cardRows.push(pooledCard(`pool-${index}`));
}

/** A channel that answered `hoursAgo` hours before NOW — what the staleness check reads. */
function answeredHoursAgo(hoursAgo: number): ChannelStateRow {
  return {
    source_id: "hacker-news-front-page",
    etag: null,
    last_modified: null,
    last_fetch_at: new Date(NOW.getTime() - hoursAgo * 60 * 60 * 1000).toISOString(),
    reachable: 1,
    failure_count: 0,
    daily_budget_used: 1,
    budget_day: "2026-08-17",
  };
}

/** The day's recall round has already been run, which is the ordinary state of an app that has
 * been open for a while — and the state in which the watermark alone decides whether to poll. */
function recallAlreadyRanToday(): void {
  settingRows.set("discoveryRecallBudget", { day: "2026-08-17", used: 3, cursor: 3 });
}

/** One reading event, so the reader's history has a topic in it for recall to search on. */
function readAbout(topicLabel: string): void {
  eventRows = [
    {
      id: "e1",
      card_id: "old",
      topic_label: topicLabel,
      kind: "open",
      value_ms: null,
      created_at: "2026-08-16T12:00:00.000Z",
    },
  ];
}

function pollFound(items: readonly CandidateItem[], answeredSourceCount = 1): void {
  pollChannelsForCandidatesMock.mockResolvedValue({
    items: [...items],
    attemptedSourceCount: answeredSourceCount,
    answeredSourceCount,
  });
}

// Most cases are about the watermark, so the world answered an hour ago and staleness is out of
// the way; the cases that are about staleness set their own.
beforeEach(() => {
  channelStateRows = [answeredHoursAgo(1)];
});

afterEach(() => {
  cardRows = [];
  eventRows = [];
  settingRows = new Map();
  networkEnabled = true;
  pollChannelsForCandidatesMock.mockReset();
  searchChannelsForCandidatesMock.mockReset();
  searchChannelsForCandidatesMock.mockResolvedValue([]);
  runBackgroundPassesMock.mockClear();
});

describe("refillDiscoveryPool watermark", () => {
  it("spends no request while the pool is above the low mark", async () => {
    recallAlreadyRanToday();
    fillPool(POOL_LOW_WATERMARK + 5);
    const outcome = await refillDiscoveryPool({ now: NOW });
    expect(outcome.kind).toBe("stocked");
    expect(pollChannelsForCandidatesMock).not.toHaveBeenCalled();
  });

  it("restocks once the reader has worked the pool down past the low mark", async () => {
    fillPool(POOL_LOW_WATERMARK - 1);
    pollFound([candidate("hn:1"), candidate("hn:2")]);
    const outcome = await refillDiscoveryPool({ now: NOW });
    expect(outcome.kind).toBe("refilled");
    expect(outcome.landedCount).toBe(2);
    expect(cardRows).toHaveLength(POOL_LOW_WATERMARK + 1);
  });

  it("counts a disliked card as gone when deciding whether to restock", async () => {
    fillPool(POOL_LOW_WATERMARK);
    eventRows = cardRows.slice(0, 3).map((row, index) => ({
      id: `e${index}`,
      card_id: row.id,
      topic_label: row.topic_label,
      kind: "dislike" as const,
      value_ms: null,
      created_at: "2026-08-16T12:00:00.000Z",
    }));
    pollFound([candidate("hn:1")]);
    const outcome = await refillDiscoveryPool({ now: NOW });
    expect(outcome.kind).toBe("refilled");
  });

  it("restocks on demand even from a full pool when the reader asks for more", async () => {
    fillPool(POOL_LOW_WATERMARK + 40);
    pollFound([candidate("hn:1")]);
    const outcome = await refillDiscoveryPool({ now: NOW, force: true });
    expect(outcome.kind).toBe("refilled");
    expect(pollChannelsForCandidatesMock).toHaveBeenCalledTimes(1);
  });
});

describe("refillDiscoveryPool staleness and pool limits", () => {
  it("asks the world again when a stocked pool has heard nothing for six hours", async () => {
    fillPool(POOL_LOW_WATERMARK + 40);
    channelStateRows = [answeredHoursAgo(7)];
    pollFound([candidate("hn:1")]);
    const outcome = await refillDiscoveryPool({ now: NOW });
    expect(outcome.kind).toBe("refilled");
    expect(pollChannelsForCandidatesMock).toHaveBeenCalledTimes(1);
  });

  it("asks the world on a library where nothing has ever answered", async () => {
    fillPool(POOL_LOW_WATERMARK + 40);
    channelStateRows = [];
    pollFound([candidate("hn:1")]);
    expect((await refillDiscoveryPool({ now: NOW })).kind).toBe("refilled");
  });

  it("does not count a channel that failed as an answer", async () => {
    fillPool(POOL_LOW_WATERMARK + 40);
    channelStateRows = [{ ...answeredHoursAgo(1), reachable: 0 }];
    pollFound([candidate("hn:1")]);
    expect((await refillDiscoveryPool({ now: NOW })).kind).toBe("refilled");
  });

  it("drops untouched candidates older than two weeks and keeps what the reader touched", async () => {
    const old = "2026-07-01T00:00:00.000Z";
    cardRows.push(pooledCard("stale", { created_at: old }));
    cardRows.push(pooledCard("stale-but-opened", { created_at: old, opened_at: old }));
    cardRows.push(pooledCard("stale-but-saved", { created_at: old, saved_at: old }));
    pollFound([candidate("hn:1")]);
    await refillDiscoveryPool({ now: NOW });
    expect(cardRows.map((row) => row.id).sort()).toEqual([
      "hn:1",
      "stale-but-opened",
      "stale-but-saved",
    ]);
  });
});

/**
 * The topic labels here are fields the first-run panel offers, because that is one of the two
 * places a query may come from since spec 053 T9 finding #1 — the other being words extracted
 * locally out of what the reader read. A channel's own name never becomes a search term.
 */
describe("refillDiscoveryPool active recall", () => {
  it("goes looking for the reader's own interests when polling left the pool thin", async () => {
    readAbout("编程与技术");
    pollFound([candidate("hn:1")]);
    searchChannelsForCandidatesMock.mockResolvedValue([
      { query: "编程与技术", items: [candidate("hn:recalled")] },
    ]);

    const outcome = await refillDiscoveryPool({ now: NOW });
    expect(searchChannelsForCandidatesMock).toHaveBeenCalledTimes(1);
    expect(searchChannelsForCandidatesMock.mock.calls[0]?.[0]).toContain("编程与技术");
    expect(outcome.landedCount).toBe(2);
    // The term that found it is the card's topic, not the channel that answered.
    expect(cardRows.find((row) => row.id === "hn:recalled")?.topic_label).toBe("编程与技术");
  });

  /**
   * FIXED (2026-08-17, spec 053 T10). A reader whose pool never ran low never got a round of
   * active recall at all: the watermark returned "stocked" before anything was asked, so the
   * day's query budget went unspent from one morning to the next and the feed only ever showed
   * what the world had pushed at it. The day's first restock now runs whatever the pool looks
   * like, and the daily budget is what keeps that from becoming a habit.
   */
  it("asks after the reader's own subjects once a day even from a full pool", async () => {
    fillPool(POOL_LOW_WATERMARK + 40);
    readAbout("编程与技术");
    pollFound([candidate("hn:1")]);
    searchChannelsForCandidatesMock.mockResolvedValue([
      { query: "编程与技术", items: [candidate("hn:recalled")] },
    ]);

    const first = await refillDiscoveryPool({ now: NOW });
    expect(first.kind).toBe("refilled");
    expect(searchChannelsForCandidatesMock).toHaveBeenCalledTimes(1);

    // And exactly once: the second visit to a still-full pool costs nothing again.
    const second = await refillDiscoveryPool({ now: NOW });
    expect(second.kind).toBe("stocked");
    expect(searchChannelsForCandidatesMock).toHaveBeenCalledTimes(1);
    expect(pollChannelsForCandidatesMock).toHaveBeenCalledTimes(1);
  });

  it("marks the day as asked even when the reader has no history to search on", async () => {
    fillPool(POOL_LOW_WATERMARK + 40);
    pollFound([candidate("hn:1")]);
    await refillDiscoveryPool({ now: NOW });
    expect(searchChannelsForCandidatesMock).not.toHaveBeenCalled();
    expect((await refillDiscoveryPool({ now: NOW })).kind).toBe("stocked");
  });

  it("stops searching once the day's query budget is gone", async () => {
    settingRows.set("discoveryRecallBudget", { day: "2026-08-17", used: 12 });
    readAbout("编程与技术");
    pollFound([candidate("hn:1")]);
    await refillDiscoveryPool({ now: NOW });
    expect(searchChannelsForCandidatesMock).not.toHaveBeenCalled();
  });

  it("charges the queries it spent against today's budget", async () => {
    readAbout("编程与技术");
    pollFound([candidate("hn:1")]);
    searchChannelsForCandidatesMock.mockResolvedValue([{ query: "编程与技术", items: [] }]);
    await refillDiscoveryPool({ now: NOW });
    expect(settingRows.get("discoveryRecallBudget")).toMatchObject({ used: 1 });
  });

  it("does not search at all when the reader's history says nothing yet", async () => {
    pollFound([candidate("hn:1")]);
    await refillDiscoveryPool({ now: NOW });
    expect(searchChannelsForCandidatesMock).not.toHaveBeenCalled();
  });
});

describe("refillDiscoveryPool when there is nothing to be had", () => {
  it("touches no channel and states the plain reason while networking is off", async () => {
    networkEnabled = false;
    const outcome = await refillDiscoveryPool({ now: NOW });
    expect(outcome.kind).toBe("unavailable");
    expect(outcome.reason).toBe("翻过的卡片还能读；新卡片需要联网和开关。");
    expect(pollChannelsForCandidatesMock).not.toHaveBeenCalled();
  });

  it("reports unavailable, not an error, when no channel answered", async () => {
    pollFound([], 0);
    const outcome = await refillDiscoveryPool({ now: NOW });
    expect(outcome.kind).toBe("unavailable");
    expect(outcome.landedCount).toBe(0);
  });

  it("counts a round where every feed was unchanged as a real round, not a failure", async () => {
    pollFound([], 3);
    const outcome = await refillDiscoveryPool({ now: NOW });
    expect(outcome.kind).toBe("refilled");
    expect(outcome.landedCount).toBe(0);
    expect(outcome.reason).toBeNull();
  });

  it("inserts nothing the second time a round brings back the same items", async () => {
    pollFound([candidate("hn:1"), candidate("hn:2")]);
    await refillDiscoveryPool({ now: NOW });
    const second = await refillDiscoveryPool({ now: NOW });
    expect(second.landedCount).toBe(0);
    expect(cardRows.map((row) => row.id)).toEqual(["hn:1", "hn:2"]);
  });

  it("hands the quality check and the embedding pass back to run behind the feed", async () => {
    pollFound([candidate("hn:1")]);
    const outcome = await refillDiscoveryPool({ now: NOW });
    await outcome.backgroundWork;
    expect(runBackgroundPassesMock).toHaveBeenCalledTimes(1);
  });

  /**
   * FIXED (2026-08-17, spec 053 T10b). The passes used to be handed the rows a round had just
   * landed, so a launch onto a stocked pool ran them over an empty list and they did nothing at
   * all. On a fresh install that is exactly the launch after the first one, and the quality check
   * — which could not run the first time, before the API key existed — never got a second chance.
   * The passes read the pool for themselves now, and a stocked round still starts them.
   */
  it("runs the passes behind a stocked pool too, where the backlog is", async () => {
    recallAlreadyRanToday();
    fillPool(POOL_LOW_WATERMARK + 5);
    const outcome = await refillDiscoveryPool({ now: NOW });
    expect(outcome.kind).toBe("stocked");
    await outcome.backgroundWork;
    expect(runBackgroundPassesMock).toHaveBeenCalledTimes(1);
  });
});
