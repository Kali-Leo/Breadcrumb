/**
 * Purpose: unit tests for discoveryStore — impression dedup (once per session per card),
 * dislike removing a card from the display list while still recording the event, and
 * loadInitial's blocked-reason banner when generateBatch can't produce a starter batch.
 */
import type { DiscoveryCardRow, DiscoveryEventRow } from "@breadcrumb/core-db";
import { afterEach, describe, expect, it, vi } from "vitest";

let cardRows: DiscoveryCardRow[] = [];
let eventRows: DiscoveryEventRow[] = [];
const insertEventMock = vi.fn(async (row: DiscoveryEventRow) => {
  eventRows.push(row);
});

vi.mock("../lib/db", () => ({
  getRepos: vi.fn(async () => ({
    discovery: {
      listNewestCards: async (limit: number) => cardRows.slice(0, limit),
      listAllEvents: async () => eventRows,
      insertEvent: insertEventMock,
      markOpened: vi.fn(async () => {}),
    },
  })),
}));

const generateBatchMock = vi.fn();
vi.mock("../lib/discoveryActions", () => ({ generateBatch: generateBatchMock }));

vi.mock("../lib/discoveryArticleActions", () => ({ streamCardArticle: vi.fn() }));

const { useDiscoveryStore } = await import("./discoveryStore");

function card(id: string): DiscoveryCardRow {
  return {
    id,
    title: `title-${id}`,
    hook: "hook",
    topic_label: "topic",
    source: "starter",
    body_md: null,
    embedding_json: null,
    batch_id: "batch",
    created_at: "2026-08-16T00:00:00.000Z",
    opened_at: null,
    source_id: null,
    kind: null,
    url: null,
    cover_url: null,
    author: null,
    published_at: null,
    saved_at: null,
    quality_score: null,
  };
}

afterEach(() => {
  cardRows = [];
  eventRows = [];
  insertEventMock.mockClear();
  generateBatchMock.mockReset();
  useDiscoveryStore.setState({
    cards: [],
    loading: false,
    blockedReason: null,
    sessionImpressedIds: new Set(),
  });
});

describe("recordImpression", () => {
  it("records an impression event only once per session per card", async () => {
    useDiscoveryStore.setState({ cards: [card("a")] });
    await useDiscoveryStore.getState().recordImpression("a", "topic");
    await useDiscoveryStore.getState().recordImpression("a", "topic");
    expect(insertEventMock).toHaveBeenCalledTimes(1);
    expect(insertEventMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "impression" }));
  });

  it("still records a second, different card's impression", async () => {
    useDiscoveryStore.setState({ cards: [card("a"), card("b")] });
    await useDiscoveryStore.getState().recordImpression("a", "topic");
    await useDiscoveryStore.getState().recordImpression("b", "topic");
    expect(insertEventMock).toHaveBeenCalledTimes(2);
  });
});

describe("dislikeCard", () => {
  it("removes the card from the display list and records a dislike event", async () => {
    useDiscoveryStore.setState({ cards: [card("a"), card("b")] });
    await useDiscoveryStore.getState().dislikeCard("a", "topic");
    expect(useDiscoveryStore.getState().cards.map((c) => c.id)).toEqual(["b"]);
    expect(insertEventMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "dislike" }));
  });
});

describe("loadInitial", () => {
  it("sets the blocked-reason banner and an empty grid when a cold-start generation is blocked", async () => {
    generateBatchMock.mockResolvedValue({
      kind: "blocked",
      reason: "翻过的卡片还能读；新卡片需要联网和开关。",
    });
    await useDiscoveryStore.getState().loadInitial();
    expect(useDiscoveryStore.getState().cards).toEqual([]);
    expect(useDiscoveryStore.getState().blockedReason).toBe(
      "翻过的卡片还能读；新卡片需要联网和开关。",
    );
    expect(useDiscoveryStore.getState().loading).toBe(false);
  });

  it("loads existing cards without calling generateBatch when the DB already has some", async () => {
    cardRows = [card("existing")];
    await useDiscoveryStore.getState().loadInitial();
    expect(generateBatchMock).not.toHaveBeenCalled();
    expect(useDiscoveryStore.getState().cards.map((c) => c.id)).toEqual(["existing"]);
  });
});

describe("warm-up and load sharing one generation (handoff 2026-08-17 §五.a)", () => {
  it("ensureWarm lands its generated batch into display state, not just the DB", async () => {
    generateBatchMock.mockResolvedValue({ kind: "generated", cards: [card("w1")] });
    await useDiscoveryStore.getState().ensureWarm();
    expect(useDiscoveryStore.getState().cards.map((c) => c.id)).toEqual(["w1"]);
    expect(useDiscoveryStore.getState().loading).toBe(false);
  });

  it("loadInitial during an in-flight warm-up awaits the same batch instead of showing an empty screen", async () => {
    let resolveGeneration = (_: unknown): void => {};
    generateBatchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveGeneration = resolve;
      }),
    );
    const warm = useDiscoveryStore.getState().ensureWarm();
    const initial = useDiscoveryStore.getState().loadInitial();
    resolveGeneration({ kind: "generated", cards: [card("w1")] });
    await Promise.all([warm, initial]);
    expect(generateBatchMock).toHaveBeenCalledTimes(1);
    expect(useDiscoveryStore.getState().cards.map((c) => c.id)).toEqual(["w1"]);
    expect(useDiscoveryStore.getState().loading).toBe(false);
  });

  it("a blocked warm-up stays silent (no banner) when nobody has opened the feed", async () => {
    generateBatchMock.mockResolvedValue({ kind: "blocked", reason: "翻过的卡片还能读。" });
    await useDiscoveryStore.getState().ensureWarm();
    expect(useDiscoveryStore.getState().blockedReason).toBeNull();
    expect(useDiscoveryStore.getState().loading).toBe(false);
  });
});
