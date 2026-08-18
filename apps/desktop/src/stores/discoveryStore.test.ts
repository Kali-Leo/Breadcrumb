/**
 * Purpose: unit tests for discoveryStore — paging out of the local pool, the app-start restock
 * and a mount-time load sharing one round, the banner appearing only for a cold empty feed,
 * impression dedup, and the signal actions (save/unsave/finish/dislike) writing what spec 053
 * §6 says they write.
 */
import type { DiscoveryCardRow, DiscoveryEventRow } from "@breadcrumb/core-db";
import { beforeEach, describe, expect, it, vi } from "vitest";

let cardRows: DiscoveryCardRow[] = [];
let eventRows: DiscoveryEventRow[] = [];
const insertEventMock = vi.fn(async (row: DiscoveryEventRow) => {
  eventRows.push(row);
});
const markSavedMock = vi.fn(async () => {});
const markOpenedMock = vi.fn(async () => {});

vi.mock("../lib/db", () => ({
  getRepos: vi.fn(async () => ({
    discovery: {
      listNewestCards: async (limit: number) => cardRows.slice(0, limit),
      // The grid only ever reads the unseen pool: an opened card is off it for good.
      listUnseenPoolCards: async (limit: number) =>
        cardRows.filter((row) => row.opened_at === null).slice(0, limit),
      listAllEvents: async () => eventRows,
      insertEvent: insertEventMock,
      markOpened: markOpenedMock,
      markSaved: markSavedMock,
    },
    // The ranking pass reads the reader's languages (spec 054); an unanswered row means the
    // default language, which is all these tests need it to mean.
    settings: {
      get: async () => null,
      set: async () => {},
    },
  })),
}));

const refillDiscoveryPoolMock = vi.fn();
vi.mock("../lib/discoveryRefill", () => ({ refillDiscoveryPool: refillDiscoveryPoolMock }));

vi.mock("../lib/discoveryArticleActions", () => ({ streamCardArticle: vi.fn() }));

/** A redraw has to put the reader back at the top of the real scrolling element (spec 054); the
 * store asks this module to do it, and these tests watch that it was asked. */
const scrollToTopMock = vi.fn();
vi.mock("../lib/discoveryFeedScroll", () => ({
  registerDiscoveryFeedScroller: vi.fn(),
  scrollDiscoveryFeedToTop: () => scrollToTopMock(),
}));

const { useDiscoveryStore } = await import("./discoveryStore");
const { useSettingsStore } = await import("./settingsStore");

const NOTHING_NEW = "翻过的卡片还能读；新卡片需要联网和开关。";

function card(id: string): DiscoveryCardRow {
  return {
    id,
    title: `title-${id}`,
    hook: "hook",
    topic_label: "topic",
    source: "explore",
    body_md: null,
    embedding_json: null,
    batch_id: "batch",
    created_at: "2026-08-16T00:00:00.000Z",
    opened_at: null,
    // 少数派 is one of the catalog sources labelled "both", so these cards are shown in either
    // 休闲 or 专业 and nothing here turns on the mode filter (spec 054).
    source_id: "sspai",
    kind: "article",
    url: `https://example.org/${id}`,
    cover_url: null,
    author: null,
    published_at: "2026-08-16T00:00:00.000Z",
    saved_at: null,
    quality_score: null,
    upstream_signal: null,
    media_url: null,
    ...(id === "" ? {} : {}),
  };
}

function cardOn(id: string, topicLabel: string): DiscoveryCardRow {
  return { ...card(id), topic_label: topicLabel };
}

function stocked() {
  return {
    kind: "stocked" as const,
    landedCount: 0,
    unseenCount: cardRows.length,
    reason: null,
    backgroundWork: Promise.resolve(),
  };
}

function unavailable() {
  return {
    kind: "unavailable" as const,
    landedCount: 0,
    unseenCount: 0,
    reason: NOTHING_NEW,
    backgroundWork: Promise.resolve(),
  };
}

/** A restock that actually brings cards home: they are in the pool by the time it resolves. */
function refillsWith(ids: readonly string[]) {
  return async () => {
    // The real landing pass is idempotent by card id (discoveryPoolLanding); the fake pool
    // behaves the same way, so a repeated round cannot invent a duplicate card.
    for (const id of ids) if (!cardRows.some((row) => row.id === id)) cardRows.push(card(id));
    return {
      kind: "refilled" as const,
      landedCount: ids.length,
      unseenCount: cardRows.length,
      reason: null,
      backgroundWork: Promise.resolve(),
    };
  };
}

beforeEach(() => {
  cardRows = [];
  eventRows = [];
  insertEventMock.mockClear();
  markSavedMock.mockClear();
  markOpenedMock.mockClear();
  scrollToTopMock.mockClear();
  refillDiscoveryPoolMock.mockReset();
  refillDiscoveryPoolMock.mockResolvedValue(stocked());
  useDiscoveryStore.setState({
    cards: [],
    pending: [],
    loading: false,
    blockedReason: null,
    sessionImpressedIds: new Set(),
  });
});

describe("loadInitial", () => {
  it("shows what the pool already holds without waiting on a restock", async () => {
    cardRows = [card("a"), card("b")];
    await useDiscoveryStore.getState().loadInitial();
    expect(
      useDiscoveryStore
        .getState()
        .cards.map((c) => c.id)
        .sort(),
    ).toEqual(["a", "b"]);
    expect(useDiscoveryStore.getState().loading).toBe(false);
    expect(useDiscoveryStore.getState().blockedReason).toBeNull();
  });

  it("fills a cold empty pool from the restock it triggers", async () => {
    refillDiscoveryPoolMock.mockImplementation(refillsWith(["fresh-1", "fresh-2"]));
    await useDiscoveryStore.getState().loadInitial();
    expect(
      useDiscoveryStore
        .getState()
        .cards.map((c) => c.id)
        .sort(),
    ).toEqual(["fresh-1", "fresh-2"]);
  });

  it("states the plain reason when a cold start has nothing and nothing can be fetched", async () => {
    refillDiscoveryPoolMock.mockResolvedValue(unavailable());
    await useDiscoveryStore.getState().loadInitial();
    expect(useDiscoveryStore.getState().cards).toEqual([]);
    expect(useDiscoveryStore.getState().blockedReason).toBe(NOTHING_NEW);
    expect(useDiscoveryStore.getState().loading).toBe(false);
  });

  it("says nothing at all when the grid has cards and the restock came back empty-handed", async () => {
    cardRows = [card("a")];
    refillDiscoveryPoolMock.mockResolvedValue(unavailable());
    await useDiscoveryStore.getState().loadInitial();
    expect(useDiscoveryStore.getState().cards.map((c) => c.id)).toEqual(["a"]);
    expect(useDiscoveryStore.getState().blockedReason).toBeNull();
  });

  it("does not reload over a grid the reader is already looking at", async () => {
    cardRows = [card("a")];
    await useDiscoveryStore.getState().loadInitial();
    await useDiscoveryStore.getState().loadInitial();
    expect(useDiscoveryStore.getState().cards.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("the app-start restock and the feed's first load", () => {
  it("puts the warm-up's cards on the grid instead of leaving them in the database", async () => {
    refillDiscoveryPoolMock.mockImplementation(refillsWith(["w1"]));
    await useDiscoveryStore.getState().refillPool();
    await useDiscoveryStore.getState().loadInitial();
    expect(useDiscoveryStore.getState().cards.map((c) => c.id)).toEqual(["w1"]);
  });

  it("runs one round when two restocks are asked for at the same time", async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    refillDiscoveryPoolMock.mockImplementation(async () => {
      await gate;
      return refillsWith(["w1"])();
    });
    const first = useDiscoveryStore.getState().refillPool();
    const second = useDiscoveryStore.getState().refillPool();
    release();
    await Promise.all([first, second]);
    expect(refillDiscoveryPoolMock).toHaveBeenCalledTimes(1);
  });

  it("leaves no empty screen behind a restock that is still running (handoff §五.a)", async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    refillDiscoveryPoolMock.mockImplementation(async () => {
      await gate;
      return refillsWith(["w1"])();
    });
    const warm = useDiscoveryStore.getState().refillPool();
    const initial = useDiscoveryStore.getState().loadInitial();
    release();
    await Promise.all([warm, initial]);
    expect(useDiscoveryStore.getState().cards.map((c) => c.id)).toEqual(["w1"]);
    expect(useDiscoveryStore.getState().loading).toBe(false);
  });

  /**
   * FIXED (2026-08-17, spec 053 T10b). The restock the first-run panel starts used to join
   * whatever round was already in the air — and on a first launch that round began before the
   * reader had said a word, so it searched for nothing and the panel's answers waited for the
   * next day. The panel's round now queues behind it and runs on its own terms.
   */
  it("runs the first-run panel's round after the one already in flight, not instead of it", async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    refillDiscoveryPoolMock.mockImplementation(async (options?: { forceRecall?: boolean }) => {
      if (options?.forceRecall !== true) await gate;
      return refillsWith(["w1"])();
    });
    const warm = useDiscoveryStore.getState().refillPool();
    const panel = useDiscoveryStore.getState().refillPool({ forceRecall: true });
    release();
    await Promise.all([warm, panel]);
    expect(refillDiscoveryPoolMock).toHaveBeenCalledTimes(2);
    expect(refillDiscoveryPoolMock.mock.calls[1]?.[0]).toMatchObject({ forceRecall: true });
  });

  it("keeps a failed warm-up silent — nobody has opened the feed yet", async () => {
    refillDiscoveryPoolMock.mockResolvedValue(unavailable());
    await useDiscoveryStore.getState().refillPool();
    expect(useDiscoveryStore.getState().blockedReason).toBeNull();
    expect(useDiscoveryStore.getState().loading).toBe(false);
  });
});

describe("loadMore", () => {
  it("hands over one page at a time and never the same card twice", async () => {
    cardRows = Array.from({ length: 30 }, (_, index) => card(`c${index}`));
    await useDiscoveryStore.getState().loadInitial();
    const firstPage = useDiscoveryStore.getState().cards.length;
    await useDiscoveryStore.getState().loadMore();
    const shown = useDiscoveryStore.getState().cards.map((c) => c.id);
    expect(firstPage).toBe(24);
    expect(shown).toHaveLength(30);
    expect(new Set(shown).size).toBe(30);
  });

  it("asks for a restock when the reader has reached the end of the pool", async () => {
    cardRows = [card("a")];
    await useDiscoveryStore.getState().loadInitial();
    refillDiscoveryPoolMock.mockImplementation(refillsWith(["more-1"]));
    await useDiscoveryStore.getState().loadMore();
    expect(useDiscoveryStore.getState().cards.map((c) => c.id)).toEqual(["a", "more-1"]);
  });
});

describe("silent signals", () => {
  it("records an impression once per session per card", async () => {
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

  it("records reading something to the end", async () => {
    await useDiscoveryStore.getState().recordFinish("a", "topic");
    expect(insertEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "finish", card_id: "a", topic_label: "topic" }),
    );
  });

  it("saves a card, and unsaving takes it back off the list without disliking it", async () => {
    useDiscoveryStore.setState({ cards: [card("a")] });
    await useDiscoveryStore.getState().saveCard("a", "topic");
    expect(useDiscoveryStore.getState().cards[0]?.saved_at).not.toBeNull();
    expect(markSavedMock).toHaveBeenLastCalledWith("a", expect.any(String));

    await useDiscoveryStore.getState().unsaveCard("a", "topic");
    expect(useDiscoveryStore.getState().cards[0]?.saved_at).toBeNull();
    expect(markSavedMock).toHaveBeenLastCalledWith("a", null);
    expect(eventRows.map((row) => row.kind)).toEqual(["save", "unsave"]);
  });

  it("removes a disliked card from the grid and from what was queued behind it", async () => {
    useDiscoveryStore.setState({ cards: [card("a"), card("b")], pending: [card("a")] });
    await useDiscoveryStore.getState().dislikeCard("a", "topic");
    expect(useDiscoveryStore.getState().cards.map((c) => c.id)).toEqual(["b"]);
    expect(useDiscoveryStore.getState().pending).toEqual([]);
    expect(insertEventMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "dislike" }));
  });
});

/** A grid the reader is part-way down: the first two cards have been on screen (an impression
 * each), the four below them have not been reached yet. */
function partlyReadGrid(): DiscoveryCardRow[] {
  return [
    cardOn("seen-1", "看过的"),
    cardOn("seen-2", "看过的"),
    cardOn("f1", "熟悉"),
    cardOn("f2", "熟悉"),
    cardOn("f3", "熟悉"),
    cardOn("f4", "熟悉"),
  ];
}

function gridTopics(): string[] {
  return useDiscoveryStore
    .getState()
    .cards.slice(2)
    .map((c) => c.topic_label);
}

describe("reshapeUpcoming — moving the feed's dial", () => {
  beforeEach(() => {
    // The pool holds the grid plus four cards on a field the reader has no history with.
    cardRows = [
      ...partlyReadGrid(),
      cardOn("n1", "新领域"),
      cardOn("n2", "新领域"),
      cardOn("n3", "新领域"),
      cardOn("n4", "新领域"),
    ];
    // One finish on 熟悉 is what makes that topic the familiar side and 新领域 the unfamiliar one.
    eventRows = [
      {
        id: "seed-event",
        card_id: "seed",
        topic_label: "熟悉",
        kind: "finish",
        value_ms: null,
        created_at: new Date().toISOString(),
      },
    ];
    useDiscoveryStore.setState({
      cards: partlyReadGrid(),
      pending: [],
      sessionImpressedIds: new Set(["seen-1", "seen-2"]),
    });
    useSettingsStore.setState({ discoveryExplorationShare: 0.15 });
  });

  it("changes what is coming up as soon as the dial moves", async () => {
    // How far down the reader has to scroll before meeting something new. Counting instead does
    // not tell the two dial positions apart here: the pool holds one familiar topic, and the
    // per-topic quota only lets three of it onto a page whatever the dial says (spec 053 §4),
    // which is why this no longer reads ["熟悉", "熟悉", "熟悉", "熟悉"] at the familiar end.
    const firstNewTerritory = (): number => gridTopics().indexOf("新领域");
    await useDiscoveryStore.getState().reshapeUpcoming();
    const familiarLeaning = firstNewTerritory();
    expect(familiarLeaning).toBeGreaterThan(0);

    useSettingsStore.setState({ discoveryExplorationShare: 0.4 });
    await useDiscoveryStore.getState().reshapeUpcoming();
    expect(gridTopics()).toContain("新领域");
    expect(firstNewTerritory()).toBeLessThan(familiarLeaning);
  });

  it("leaves every card the reader has already seen exactly where it was", async () => {
    useSettingsStore.setState({ discoveryExplorationShare: 0.4 });
    await useDiscoveryStore.getState().reshapeUpcoming();
    const ids = useDiscoveryStore.getState().cards.map((c) => c.id);
    expect(ids.slice(0, 2)).toEqual(["seen-1", "seen-2"]);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6); // no card shown twice after the re-shape
  });

  it("queues the cards that did not fit rather than dropping them", async () => {
    useSettingsStore.setState({ discoveryExplorationShare: 0.4 });
    await useDiscoveryStore.getState().reshapeUpcoming();
    const shown = new Set(useDiscoveryStore.getState().cards.map((c) => c.id));
    const queued = useDiscoveryStore.getState().pending.map((c) => c.id);
    expect(queued.length).toBeGreaterThan(0);
    expect(queued.some((id) => shown.has(id))).toBe(false);
  });
});

/**
 * Spec 054, Leo's fifth point — 「整流换掉」. The three controls on the feed page itself (the dial,
 * the 休闲/专业 mode and the 学术内容 switch) do not re-rank what is below the fold: they replace
 * what is on screen and send the reader back to the top of it.
 */
describe("redrawFeed — a control on the feed page was just moved", () => {
  beforeEach(() => {
    cardRows = [cardOn("a", "熟悉"), cardOn("b", "熟悉"), cardOn("c", "新领域")];
    useDiscoveryStore.setState({
      cards: [cardOn("old-1", "看过的"), cardOn("old-2", "看过的")],
      pending: [],
      sessionImpressedIds: new Set(["old-1", "old-2"]),
    });
  });

  it("replaces every card on the grid with a fresh page out of the pool", async () => {
    await useDiscoveryStore.getState().redrawFeed();
    const ids = useDiscoveryStore.getState().cards.map((c) => c.id);
    expect(ids).not.toContain("old-1");
    expect(ids.sort()).toEqual(["a", "b", "c"]);
    expect(useDiscoveryStore.getState().loading).toBe(false);
  });

  it("puts the reader back at the top of the feed", async () => {
    await useDiscoveryStore.getState().redrawFeed();
    expect(scrollToTopMock).toHaveBeenCalledOnce();
  });

  it("stages the rest of the pool behind the new page instead of leaving the queue stale", async () => {
    const wide = Array.from({ length: 30 }, (_, index) => cardOn(`p${index}`, "熟悉"));
    cardRows = wide;
    useDiscoveryStore.setState({ pending: [cardOn("stale", "看过的")] });
    await useDiscoveryStore.getState().redrawFeed();
    const queued = useDiscoveryStore.getState().pending.map((c) => c.id);
    expect(queued).not.toContain("stale");
    expect(queued.length).toBeGreaterThan(0);
  });

  it("deletes nothing — the pool still holds every card it held", async () => {
    const before = cardRows.map((row) => row.id);
    await useDiscoveryStore.getState().redrawFeed();
    expect(cardRows.map((row) => row.id)).toEqual(before);
  });

  it("goes and fetches when the pool cannot fill the new page", async () => {
    cardRows = [];
    refillDiscoveryPoolMock.mockImplementation(refillsWith(["fresh-1", "fresh-2"]));
    await useDiscoveryStore.getState().redrawFeed();
    expect(useDiscoveryStore.getState().cards.map((c) => c.id)).toEqual(["fresh-1", "fresh-2"]);
  });

  it("says so plainly when the redraw leaves nothing to show", async () => {
    cardRows = [];
    refillDiscoveryPoolMock.mockResolvedValue(unavailable());
    await useDiscoveryStore.getState().redrawFeed();
    expect(useDiscoveryStore.getState().cards).toEqual([]);
    expect(useDiscoveryStore.getState().blockedReason).toBe(NOTHING_NEW);
  });
});

describe("openCard", () => {
  it("records an item opened from the 收藏 list, which is not on the grid", async () => {
    useDiscoveryStore.setState({ cards: [card("on-grid")] });
    await useDiscoveryStore.getState().openCard(card("kept-weeks-ago"));
    expect(markOpenedMock).toHaveBeenCalledWith("kept-weeks-ago", expect.any(String));
    expect(insertEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "open", card_id: "kept-weeks-ago" }),
    );
  });

  it("marks the grid's own row opened", async () => {
    useDiscoveryStore.setState({ cards: [card("a")] });
    await useDiscoveryStore.getState().openCard(card("a"));
    expect(useDiscoveryStore.getState().cards[0]?.opened_at).not.toBeNull();
  });

  it("writes one open event however often the same item is re-opened", async () => {
    const row = card("a");
    useDiscoveryStore.setState({ cards: [row] });
    await useDiscoveryStore.getState().openCard(row);
    // The reader closes the overlay and opens the same card again: the caller still holds the
    // snapshot from before, so the guard has to read the row the store now has.
    await useDiscoveryStore.getState().openCard(row);
    expect(insertEventMock).toHaveBeenCalledTimes(1);
  });

  it("does not re-record an item the reader opened in an earlier session", async () => {
    const alreadyRead = { ...card("old"), opened_at: "2026-08-16T09:00:00.000Z" };
    await useDiscoveryStore.getState().openCard(alreadyRead);
    expect(insertEventMock).not.toHaveBeenCalled();
    expect(markOpenedMock).not.toHaveBeenCalled();
  });
});
