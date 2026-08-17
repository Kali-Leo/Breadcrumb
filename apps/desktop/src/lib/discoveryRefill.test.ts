/**
 * Purpose: unit tests for refillDiscoveryPool — the high/low watermark (a stocked pool costs no
 * request, a thin one restocks, dislikes count as consumed), active recall only when polling
 * left the pool short, the daily query budget, landing idempotence across two restocks, and the
 * silent outcome when networking is off or nothing out there answers. The channel layer is
 * mocked; landing, recall and the pool arithmetic all run for real.
 */
import type { DiscoveryCardRow, DiscoveryEventRow } from "@breadcrumb/core-db";
import type { CandidateItem } from "@breadcrumb/plugin-channels";
import { afterEach, describe, expect, it, vi } from "vitest";

let cardRows: DiscoveryCardRow[] = [];
let eventRows: DiscoveryEventRow[] = [];
let settingRows = new Map<string, unknown>();

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

const runBackgroundPassesMock = vi.fn(async (_rows: readonly unknown[]) => {});
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
    ...overrides,
  };
}

function fillPool(count: number): void {
  for (let index = 0; index < count; index += 1) cardRows.push(pooledCard(`pool-${index}`));
}

function pollFound(items: readonly CandidateItem[], answeredSourceCount = 1): void {
  pollChannelsForCandidatesMock.mockResolvedValue({
    items: [...items],
    attemptedSourceCount: answeredSourceCount,
    answeredSourceCount,
  });
}

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

describe("refillDiscoveryPool active recall", () => {
  it("goes looking for the reader's own interests when polling left the pool thin", async () => {
    eventRows = [
      {
        id: "e1",
        card_id: "old",
        topic_label: "编译器",
        kind: "open",
        value_ms: null,
        created_at: "2026-08-16T12:00:00.000Z",
      },
    ];
    pollFound([candidate("hn:1")]);
    searchChannelsForCandidatesMock.mockResolvedValue([
      { query: "编译器", items: [candidate("hn:recalled")] },
    ]);

    const outcome = await refillDiscoveryPool({ now: NOW });
    expect(searchChannelsForCandidatesMock).toHaveBeenCalledTimes(1);
    expect(searchChannelsForCandidatesMock.mock.calls[0]?.[0]).toContain("编译器");
    expect(outcome.landedCount).toBe(2);
    // The term that found it is the card's topic, not the channel that answered.
    expect(cardRows.find((row) => row.id === "hn:recalled")?.topic_label).toBe("编译器");
  });

  it("stops searching once the day's query budget is gone", async () => {
    settingRows.set("discoveryRecallBudget", { day: "2026-08-17", used: 12 });
    eventRows = [
      {
        id: "e1",
        card_id: "old",
        topic_label: "编译器",
        kind: "open",
        value_ms: null,
        created_at: "2026-08-16T12:00:00.000Z",
      },
    ];
    pollFound([candidate("hn:1")]);
    await refillDiscoveryPool({ now: NOW });
    expect(searchChannelsForCandidatesMock).not.toHaveBeenCalled();
  });

  it("charges the queries it spent against today's budget", async () => {
    eventRows = [
      {
        id: "e1",
        card_id: "old",
        topic_label: "编译器",
        kind: "open",
        value_ms: null,
        created_at: "2026-08-16T12:00:00.000Z",
      },
    ];
    pollFound([candidate("hn:1")]);
    searchChannelsForCandidatesMock.mockResolvedValue([{ query: "编译器", items: [] }]);
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
    expect(runBackgroundPassesMock.mock.calls[0]?.[0]).toHaveLength(1);
  });
});
