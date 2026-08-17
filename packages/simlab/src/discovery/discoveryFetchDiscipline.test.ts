/**
 * Purpose: the spec-053 §2 抓取纪律 promises, checked against the app's own restock path with a
 * fake socket underneath — conditional requests, the per-channel rate limit, 省流量模式, an
 * unreachable channel costing nothing, the quality check's switch and its 计价 line, and what the
 * high/low watermark does to a reader who never empties the pool. Every assertion is a trip-wire;
 * the ones that started life as findings carry the note on what they caught and how it was fixed.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { TopicFeed } from "./topicFeedCatalog";

vi.mock("../../../../apps/desktop/src/lib/db", () => import("./desktopDatabase"));
vi.mock("@tauri-apps/api/core", () => import("./desktopRuntimeDoubles"));
vi.mock("@tauri-apps/plugin-http", () => import("./tauriHttpDouble"));
vi.mock("@breadcrumb/core-llm", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const doubles = await import("./desktopRuntimeDoubles");
  return { ...original, chatJson: doubles.chatJson };
});

const { closeDiscoveryDatabase, getRepos } = await import("./desktopDatabase");
const { installFakeNetwork, fakeNetwork } = await import("./tauriHttpDouble");
const { createFakeChannelNetwork } = await import("./fakeChannelNetwork");
const { resetRuntimeDoubles, runtimeCallCounts } = await import("./desktopRuntimeDoubles");
const {
  drainBackgroundWork,
  JOURNEY_START,
  pinRandomness,
  prepareDiscoveryJourney,
  runJourneyDay,
} = await import("./discoveryJourneyHarness");
const { HACKER_NEWS_SEARCH_PREFIX, JOURNEY_FEEDS, TOPIC_FEEDS, topicFeedByKey } = await import(
  "./syntheticChannelWorld"
);
const { refillDiscoveryPool } = await import("../../../../apps/desktop/src/lib/discoveryRefill");
const { PER_SOURCE_LANDING_CAP } = await import(
  "../../../../apps/desktop/src/lib/discoveryPoolLanding"
);
const { useDiscoveryChannelSettingsStore } = await import(
  "../../../../apps/desktop/src/stores/discoveryChannelSettingsStore"
);

const persona = {
  name: "抓取纪律读者",
  interests: [topicFeedByKey("compilers").topicLabel],
  aversion: topicFeedByKey("gossip").topicLabel,
  attention: 0.4,
};

async function freshRun(
  options: { qualityCheckEnabled?: boolean; feeds?: readonly TopicFeed[] } = {},
) {
  installFakeNetwork(createFakeChannelNetwork());
  resetRuntimeDoubles();
  const run = await prepareDiscoveryJourney({ network: fakeNetwork(), ...options });
  run.world.publishDay(0, JOURNEY_START.toISOString());
  return run;
}

/**
 * Every address a pooled card points at. A request to one of these is the cover pass reading an
 * article page: nothing else in the app fetches a card's own address behind the reader.
 */
async function pooledCardAddresses(): Promise<Set<string>> {
  const repos = await getRepos();
  const cards = await repos.discovery.listNewestCards(10_000);
  return new Set(cards.flatMap((card) => (card.url === null ? [] : [card.url])));
}

/** How many pooled cards each channel has left standing, by the label its cards are filed under. */
async function poolCountsByTopic(): Promise<Map<string, number>> {
  const repos = await getRepos();
  const counts = new Map<string, number>();
  for (const card of await repos.discovery.listNewestCards(10_000)) {
    counts.set(card.topic_label, (counts.get(card.topic_label) ?? 0) + 1);
  }
  return counts;
}

let restoreRandomness: () => void = () => undefined;

describe("discovery fetch discipline", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    restoreRandomness = pinRandomness(9001);
    vi.setSystemTime(JOURNEY_START);
  });
  afterEach(() => {
    vi.setSystemTime(JOURNEY_START);
  });
  afterAll(async () => {
    restoreRandomness();
    vi.useRealTimers();
    await drainBackgroundWork();
    await closeDiscoveryDatabase();
  });

  it("replays the validators a channel gave it, and a repeat poll costs no payload", async () => {
    const run = await freshRun();
    await (await refillDiscoveryPool({ force: true, now: JOURNEY_START })).backgroundWork;
    run.network.clearRequests();
    // A second poll only happens once the channel's own minimum interval has passed; the
    // catalog's half hour for a pasted feed is what makes the round below a real second poll
    // rather than one the discipline refuses outright.
    const laterToday = new Date(JOURNEY_START.getTime() + 31 * 60 * 1000);
    vi.setSystemTime(laterToday);
    const second = await refillDiscoveryPool({ force: true, now: laterToday });
    await second.backgroundWork;

    const compilers = topicFeedByKey("compilers");
    const repeats = run.network.requestsFor(compilers.feedUrl);
    expect(repeats.length).toBeGreaterThan(0);
    expect(repeats[0]?.headers["if-none-match"]).toBe(`"${compilers.key}-0"`);
    // Nothing new came back, so nothing landed a second time.
    expect(second.landedCount).toBe(0);
  }, 60_000);

  it("asks for no pictures at all while 省流量模式 is on", async () => {
    const run = await freshRun();
    await useDiscoveryChannelSettingsStore.getState().setDataSaverEnabled(true);
    run.network.clearRequests();
    await (await refillDiscoveryPool({ force: true, now: JOURNEY_START })).backgroundWork;
    const imageRequests = run.network.requests.filter((request) =>
      /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(request.url),
    );
    expect(imageRequests).toEqual([]);
  }, 60_000);

  it("reads no article page for a missing picture while 省流量模式 is on", async () => {
    const run = await freshRun();
    await useDiscoveryChannelSettingsStore.getState().setDataSaverEnabled(true);
    run.network.clearRequests();
    await (await refillDiscoveryPool({ force: true, now: JOURNEY_START })).backgroundWork;
    const addresses = await pooledCardAddresses();
    // Two feeds in the journey set ship no covers at all, so there is plenty here to be tempted by.
    expect([...addresses].length).toBeGreaterThan(0);
    expect(run.network.requests.filter((request) => addresses.has(request.url))).toEqual([]);
  }, 60_000);

  /**
   * Spec 053 §2, the one-attempt-ever half of the cover pass: every article address in the
   * synthetic world answers 404, and a page that gave nothing must not be asked again — not by the
   * next pass of the same day, and not tomorrow — or the daily budget would go on re-reading the
   * same dead links forever and the cards behind them would never get a turn.
   */
  it("asks an article page for its picture once, and never asks it again", async () => {
    const run = await freshRun();
    await runJourneyDay({ persona, world: run.world, network: run.network, dayIndex: 0, pages: 2 });
    const firstDay = run.network.requests.map((request) => request.url);
    await runJourneyDay({ persona, world: run.world, network: run.network, dayIndex: 1, pages: 2 });
    const secondDay = run.network.requests.map((request) => request.url);

    const addresses = await pooledCardAddresses();
    const pagesRead = (urls: string[]): string[] => urls.filter((url) => addresses.has(url));
    // Both days went looking — otherwise "asked once" would be satisfied by never asking at all.
    expect(pagesRead(firstDay).length).toBeGreaterThan(0);
    expect(pagesRead(secondDay).length).toBeGreaterThan(0);
    const everyPageRead = [...pagesRead(firstDay), ...pagesRead(secondDay)];
    const askedTwice = everyPageRead.filter((url, index) => everyPageRead.indexOf(url) !== index);
    expect(askedTwice).toEqual([]);
  }, 120_000);

  it("loses nothing when a channel is unreachable: the others still fill the grid", async () => {
    const run = await freshRun();
    const day = await runJourneyDay({
      persona,
      world: run.world,
      network: run.network,
      dayIndex: 0,
      pages: 3,
      afterPublish: () => {
        run.network.route(topicFeedByKey("gardening").feedUrl, {
          body: "gateway timeout",
          status: 504,
        });
      },
    });
    expect(day.blockedReason).toBeNull();
    expect(day.shown.length).toBeGreaterThan(10);
    expect(
      day.shown.some((card) => card.topic_label === topicFeedByKey("gardening").topicLabel),
    ).toBe(false);
  }, 60_000);

  it("spends nothing on the LLM while the 质检 switch is off", async () => {
    await freshRun({ qualityCheckEnabled: false });
    await (await refillDiscoveryPool({ force: true, now: JOURNEY_START })).backgroundWork;
    expect(runtimeCallCounts.chatJson).toBe(0);
    const repos = await getRepos();
    const pool = await repos.discovery.listNewestCards(500);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((card) => card.quality_score === null)).toBe(true);
  }, 60_000);

  it("bills the batch quality check to its own 计价 line when the switch is on", async () => {
    await freshRun();
    await (await refillDiscoveryPool({ force: true, now: JOURNEY_START })).backgroundWork;
    const repos = await getRepos();
    const spend = await repos.llmCalls.sumCostSinceByPurpose("2000-01-01T00:00:00.000Z");
    expect(spend.map((row) => row.purpose)).toEqual(["discovery-quality-check"]);
    expect(runtimeCallCounts.chatJson).toBe(1);
  }, 60_000);

  /**
   * FIXED (2026-08-17, spec 053 T9 finding #9). The per-channel minimum interval used to live only
   * in the FetchBudgetLedger on the ChannelFetcher instance, and discoveryChannels builds a brand
   * new fetcher for every round, so the ledger was empty every time: five forced restocks in the
   * same second sent five polls to every source, against a catalog that says at most one every
   * thirty minutes. The interval is now read from channel_state's last-attempt instant
   * (isSourceAvailableNow), which is the same thing that makes it hold across a restart.
   * Spec 053 §2 每渠道限频.
   */
  it("waits out a channel's minimum interval between polls", async () => {
    const run = await freshRun();
    run.network.clearRequests();
    for (let round = 0; round < 5; round += 1) {
      await (await refillDiscoveryPool({ force: true, now: JOURNEY_START })).backgroundWork;
    }
    expect(run.network.requestsFor(topicFeedByKey("compilers").feedUrl).length).toBe(1);
  }, 60_000);

  /**
   * FIXED (2026-08-17, spec 053 T9 finding #1). Active recall used to send the reader's own
   * subscription addresses to third-party search APIs: a pasted feed's cards were filed under the
   * fallback topic label discoveryPoolLanding used for a source outside the shipped catalog — the
   * raw source id, `user-feed:<the whole URL>` — and selectRecallTerms took the highest-weighted
   * topics as literal search terms, so `query=user-feed%3Ahttps%3A%2F%2F…` went out to Hacker
   * News / arXiv / iTunes. A pasted feed is now filed under its hostname, and a query may only
   * come from the first-run panel's fields or from words extracted locally out of what the reader
   * read, with anything address-shaped dropped whoever proposed it.
   */
  it("never sends anything but a topic to a third-party search API", async () => {
    const run = await freshRun();
    for (let dayIndex = 0; dayIndex < 4; dayIndex += 1) {
      await runJourneyDay({
        persona,
        world: run.world,
        network: run.network,
        dayIndex,
        pages: 8,
      });
    }
    const queries = run.network
      .requestsFor(HACKER_NEWS_SEARCH_PREFIX)
      .map((request) => new URL(request.url).searchParams.get("query") ?? "");
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.filter((query) => query.includes("http"))).toEqual([]);
  }, 120_000);

  /**
   * FIXED (2026-08-17, spec 053 T9 finding #6). A reader who did not work the pool down never got
   * new content again: the watermark returned "stocked" without touching the network whenever 30
   * pooled cards were unopened, so from the second day on nothing was polled and active recall —
   * gated behind the same call — never ran either. A round now also runs when nothing out there
   * has answered in six hours, checked at app start and at loadMore exactly as before, with no
   * timers anywhere.
   */
  it("keeps looking for new content for a reader who reads only the first page", async () => {
    const run = await freshRun();
    const requestsByDay: number[] = [];
    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      const day = await runJourneyDay({
        persona,
        world: run.world,
        network: run.network,
        dayIndex,
        pages: 1,
      });
      requestsByDay.push(day.requestCount);
    }
    expect(
      requestsByDay.slice(1).every((count) => count > 0),
      requestsByDay.join(","),
    ).toBe(true);
  }, 120_000);

  /**
   * FIXED (2026-08-17, spec 053 T10). One round's landings went into the pool whole, so a feed
   * that republishes an archive on every poll took as much of the 500-card pool as it wanted.
   * The walkthrough found two arXiv categories holding the pool between them while 新浪科技 and
   * arXiv q-bio.NC — both reachable, both polled, both answering — sat at zero cards, because the
   * trim that runs after a round drops the oldest publication first and everything the small
   * channels had landed was older than what the giant one had just published. A round now keeps
   * at most PER_SOURCE_LANDING_CAP items per source and interleaves the rest.
   * Spec 053 §3 (缓存池) and §4 (跨渠道配额).
   */
  it("shares a round out instead of letting an archive feed take the whole pool", async () => {
    const archive = topicFeedByKey("megafeed");
    const run = await freshRun({ feeds: TOPIC_FEEDS });
    expect(archive.itemsPerDay).toBeGreaterThan(PER_SOURCE_LANDING_CAP);
    await (await refillDiscoveryPool({ force: true, now: JOURNEY_START })).backgroundWork;

    const counts = await poolCountsByTopic();
    expect(counts.get(archive.topicLabel) ?? 0).toBeLessThanOrEqual(PER_SOURCE_LANDING_CAP);
    for (const feed of TOPIC_FEEDS) {
      expect(counts.get(feed.topicLabel) ?? 0, `${feed.key} landed nothing`).toBeGreaterThan(0);
    }
    expect(run.network.requestsFor(archive.feedUrl).length).toBe(1);
  }, 60_000);

  it("holds that share every round of a week, and leaves no channel at zero", async () => {
    const run = await freshRun({ feeds: TOPIC_FEEDS });
    for (let dayIndex = 0; dayIndex < 6; dayIndex += 1) {
      await runJourneyDay({
        persona,
        world: run.world,
        network: run.network,
        dayIndex,
        pages: 2,
      });
    }

    // Every card of one round carries that round's batch id, so the pool itself says how much
    // each source landed in each round — the cap holds for all of them, not just the first.
    const repos = await getRepos();
    const perRoundPerSource = new Map<string, number>();
    for (const card of await repos.discovery.listNewestCards(10_000)) {
      const key = `${card.batch_id}/${card.source_id}`;
      perRoundPerSource.set(key, (perRoundPerSource.get(key) ?? 0) + 1);
    }
    const oversized = [...perRoundPerSource].filter(([, count]) => count > PER_SOURCE_LANDING_CAP);
    expect(oversized).toEqual([]);

    const counts = await poolCountsByTopic();
    for (const feed of TOPIC_FEEDS) {
      expect(counts.get(feed.topicLabel) ?? 0, `${feed.key} was crowded out`).toBeGreaterThan(0);
    }
  }, 180_000);

  /**
   * Spec 053 §4's active layer, at journey level: once the reader has read anything at all, every
   * day sends their own subjects out to the channels that answer queries. The condition that gets
   * a day its round when nothing else would ask for one — a full pool, a world that answered
   * recently, a budget nobody has touched since midnight — is pinned in the unit test next to it
   * (apps/desktop/src/lib/discoveryRefill.test.ts).
   */
  it("asks after the reader's own subjects on every day that has a history behind it", async () => {
    const run = await freshRun();
    const daysThatSearched: number[] = [];
    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      await runJourneyDay({
        persona,
        world: run.world,
        network: run.network,
        dayIndex,
        pages: 1,
      });
      const queries = run.network.requestsFor(HACKER_NEWS_SEARCH_PREFIX);
      if (queries.length > 0) daysThatSearched.push(dayIndex);
    }
    expect(daysThatSearched).toEqual([1, 2, 3, 4]);
  }, 120_000);

  it("still shows the reader a full grid on those frozen days", async () => {
    const run = await freshRun();
    const shownPerDay: number[] = [];
    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      const day = await runJourneyDay({
        persona,
        world: run.world,
        network: run.network,
        dayIndex,
        pages: 1,
      });
      shownPerDay.push(day.shown.length);
      expect(day.blockedReason).toBeNull();
    }
    expect(shownPerDay.every((count) => count > 0)).toBe(true);
    expect(JOURNEY_FEEDS.length).toBeGreaterThan(3);
  }, 120_000);
});
