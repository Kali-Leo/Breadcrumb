/**
 * Purpose: unit tests for the background cover pass — 省流量模式 and a switched-off network cost
 * exactly zero requests, only cards that could have a picture and an address worth reading are
 * asked about, the per-pass and per-day ceilings hold, and a page that gave nothing is never
 * asked again, today or any other day.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { afterEach, describe, expect, it, vi } from "vitest";

let cardRows: DiscoveryCardRow[] = [];
const settingRows = new Map<string, unknown>();
const setCardCoverUrlMock = vi.fn(async (id: string, coverUrl: string) => {
  const row = cardRows.find((card) => card.id === id);
  if (row) row.cover_url = coverUrl;
});

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    discovery: {
      listCardsMissingCover: async (limit: number) =>
        cardRows.filter((row) => row.cover_url === null && row.url !== null).slice(0, limit),
      setCardCoverUrl: setCardCoverUrlMock,
      listCardIds: async () => cardRows.map((row) => row.id),
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

let dataSaverEnabled = false;
vi.mock("../stores/discoveryChannelSettingsStore", () => ({
  ensureDiscoveryChannelSettingsLoaded: async () => ({ dataSaverEnabled }),
}));

const recordAiFailureMock = vi.fn();
vi.mock("./failureLog", () => ({ recordAiFailure: recordAiFailureMock }));

const { DAILY_COVER_FETCH_BUDGET, PER_PASS_COVER_FETCHES, enrichMissingCovers } = await import(
  "./discoveryCoverEnrichment"
);

const DAY_ONE = new Date("2026-08-17T10:00:00.000Z");
const DAY_TWO = new Date("2026-08-18T10:00:00.000Z");

function card(id: string, overrides: Partial<DiscoveryCardRow> = {}): DiscoveryCardRow {
  return {
    id,
    title: `标题 ${id}`,
    hook: "一句话",
    topic_label: "话题",
    source: "nearby",
    body_md: null,
    embedding_json: null,
    batch_id: "batch",
    created_at: "2026-08-17T00:00:00.000Z",
    opened_at: null,
    source_id: "blog",
    kind: "article",
    url: `https://blog.example/${id}`,
    cover_url: null,
    author: null,
    published_at: "2026-08-17T00:00:00.000Z",
    saved_at: null,
    quality_score: null,
    upstream_signal: null,
    media_url: null,
    ...overrides,
  };
}

function pageWithCover(coverPath: string): Response {
  return new Response(
    `<html><head><meta property="og:image" content="${coverPath}"></head><body></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function notFound(): Response {
  return new Response("not found", { status: 404 });
}

function fetchDouble(answer: (url: string) => Response) {
  return vi.fn(async (url: string) => answer(url));
}

afterEach(() => {
  cardRows = [];
  settingRows.clear();
  networkEnabled = true;
  dataSaverEnabled = false;
  setCardCoverUrlMock.mockClear();
  recordAiFailureMock.mockClear();
});

describe("enrichMissingCovers", () => {
  it("stores the picture the page declares, resolved against the page", async () => {
    cardRows = [card("a")];
    const fetchImpl = fetchDouble(() => pageWithCover("/cover.png"));
    expect(await enrichMissingCovers({ fetchImpl, now: DAY_ONE })).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://blog.example/a");
    expect(setCardCoverUrlMock).toHaveBeenCalledWith("a", "https://blog.example/cover.png");
  });

  it("asks nothing at all while 省流量模式 is on", async () => {
    cardRows = [card("a")];
    dataSaverEnabled = true;
    const fetchImpl = fetchDouble(() => pageWithCover("/cover.png"));
    expect(await enrichMissingCovers({ fetchImpl, now: DAY_ONE })).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(settingRows.size).toBe(0);
  });

  it("asks nothing at all while networking is off", async () => {
    cardRows = [card("a")];
    networkEnabled = false;
    const fetchImpl = fetchDouble(() => pageWithCover("/cover.png"));
    expect(await enrichMissingCovers({ fetchImpl, now: DAY_ONE })).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("leaves alone the cards whose picture is not on a page it could read", async () => {
    cardRows = [
      card("has-cover", { cover_url: "https://cdn.example/x.png" }),
      card("video", { kind: "video" }),
      card("podcast", { kind: "podcast" }),
      card("no-kind", { kind: null }),
      card("not-a-url", { url: "not a url at all" }),
      card("ftp", { url: "ftp://files.example/x" }),
      card("worth-reading"),
    ];
    const fetchImpl = fetchDouble(() => pageWithCover("/cover.png"));
    await enrichMissingCovers({ fetchImpl, now: DAY_ONE });
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      "https://blog.example/worth-reading",
    ]);
  });

  it("reads a discussion and a paper as well as an article", async () => {
    cardRows = [card("d", { kind: "discussion" }), card("p", { kind: "paper" })];
    const fetchImpl = fetchDouble(() => pageWithCover("/cover.png"));
    expect(await enrichMissingCovers({ fetchImpl, now: DAY_ONE })).toBe(2);
  });

  it("spends no more than one pass's worth of requests in one pass", async () => {
    cardRows = Array.from({ length: PER_PASS_COVER_FETCHES + 12 }, (_unused, index) =>
      card(`c${index}`),
    );
    const fetchImpl = fetchDouble(() => notFound());
    await enrichMissingCovers({ fetchImpl, now: DAY_ONE });
    expect(fetchImpl).toHaveBeenCalledTimes(PER_PASS_COVER_FETCHES);
  });

  it("stops at the day's ceiling however many passes run", async () => {
    cardRows = Array.from({ length: DAILY_COVER_FETCH_BUDGET + 40 }, (_unused, index) =>
      card(`c${index}`),
    );
    const fetchImpl = fetchDouble(() => notFound());
    for (let pass = 0; pass < 6; pass += 1) {
      await enrichMissingCovers({ fetchImpl, now: DAY_ONE });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(DAILY_COVER_FETCH_BUDGET);
  });

  it("hands the allowance back when the day turns over", async () => {
    cardRows = Array.from({ length: DAILY_COVER_FETCH_BUDGET + 40 }, (_unused, index) =>
      card(`c${index}`),
    );
    const fetchImpl = fetchDouble(() => notFound());
    for (let pass = 0; pass < 4; pass += 1) {
      await enrichMissingCovers({ fetchImpl, now: DAY_ONE });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(DAILY_COVER_FETCH_BUDGET);
    await enrichMissingCovers({ fetchImpl, now: DAY_TWO });
    expect(fetchImpl).toHaveBeenCalledTimes(DAILY_COVER_FETCH_BUDGET + PER_PASS_COVER_FETCHES);
  });

  it("never asks about the same page twice, not today and not tomorrow", async () => {
    cardRows = [card("a")];
    const fetchImpl = fetchDouble(() => notFound());
    await enrichMissingCovers({ fetchImpl, now: DAY_ONE });
    await enrichMissingCovers({ fetchImpl, now: DAY_ONE });
    await enrichMissingCovers({ fetchImpl, now: DAY_TWO });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cardRows[0]?.cover_url).toBeNull();
  });

  it("treats a page with no declaration, and one that is not a page, as asked and answered", async () => {
    cardRows = [card("plain"), card("json")];
    const fetchImpl = fetchDouble((url) =>
      url.endsWith("plain")
        ? new Response("<html><head><title>x</title></head></html>", {
            headers: { "content-type": "text/html" },
          })
        : new Response("{}", { headers: { "content-type": "application/json" } }),
    );
    expect(await enrichMissingCovers({ fetchImpl, now: DAY_ONE })).toBe(0);
    await enrichMissingCovers({ fetchImpl, now: DAY_TWO });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps looking for the pages behind the ones that came back empty", async () => {
    cardRows = [card("a"), card("b")];
    const fetchImpl = fetchDouble((url) =>
      url.endsWith("a") ? notFound() : pageWithCover("https://cdn.example/b.png"),
    );
    await enrichMissingCovers({ fetchImpl, now: DAY_ONE });
    expect(setCardCoverUrlMock).toHaveBeenCalledWith("b", "https://cdn.example/b.png");
  });

  it("forgets the marker for a card that has left the pool", async () => {
    cardRows = [card("a"), card("b")];
    await enrichMissingCovers({ fetchImpl: fetchDouble(() => notFound()), now: DAY_ONE });
    expect(settingRows.get("discoveryCoverBudget")).toMatchObject({ triedCardIds: ["a", "b"] });
    // The pool aged "a" out and landed "c" — the marker list follows the pool, so it cannot grow
    // past it however many days of imageless cards go through.
    cardRows = [...cardRows.filter((row) => row.id === "b"), card("c")];
    await enrichMissingCovers({ fetchImpl: fetchDouble(() => notFound()), now: DAY_TWO });
    expect(settingRows.get("discoveryCoverBudget")).toMatchObject({ triedCardIds: ["b", "c"] });
  });

  it("runs one pass at a time, so two rounds in the air cannot read the same page twice", async () => {
    cardRows = [card("a"), card("b")];
    const fetchImpl = fetchDouble(() => pageWithCover("/cover.png"));
    const both = await Promise.all([
      enrichMissingCovers({ fetchImpl, now: DAY_ONE }),
      enrichMissingCovers({ fetchImpl, now: DAY_ONE }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(both).toEqual([2, 2]);
  });

  it("survives a request that throws, and a whole pass that does", async () => {
    cardRows = [card("a"), card("b")];
    const throwing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await enrichMissingCovers({ fetchImpl: throwing, now: DAY_ONE })).toBe(0);
    expect(recordAiFailureMock).not.toHaveBeenCalled();

    const { getRepos } = await import("./db");
    vi.mocked(getRepos).mockRejectedValueOnce(new Error("database closed"));
    expect(await enrichMissingCovers({ now: DAY_ONE })).toBe(0);
    expect(recordAiFailureMock).toHaveBeenCalledWith("discovery", expect.any(Error));
  });
});
