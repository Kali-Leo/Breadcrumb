/**
 * Purpose: the spec-053 §2 抓取纪律 promises, checked against the app's own restock path with a
 * fake socket underneath — conditional requests, the per-channel rate limit, 省流量模式, an
 * unreachable channel costing nothing, the quality check's switch and its 计价 line, and what the
 * high/low watermark does to a reader who never empties the pool. Findings are marked `it.fails`
 * with the reasoning inline; everything else is a trip-wire.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
const { HACKER_NEWS_SEARCH_PREFIX, JOURNEY_FEEDS, topicFeedByKey } = await import(
  "./syntheticChannelWorld"
);
const { refillDiscoveryPool } = await import("../../../../apps/desktop/src/lib/discoveryRefill");
const { useDiscoveryChannelSettingsStore } = await import(
  "../../../../apps/desktop/src/stores/discoveryChannelSettingsStore"
);

const persona = {
  name: "抓取纪律读者",
  interests: [topicFeedByKey("compilers").topicLabel],
  aversion: topicFeedByKey("gossip").topicLabel,
  attention: 0.4,
};

async function freshRun(options: { qualityCheckEnabled?: boolean } = {}) {
  installFakeNetwork(createFakeChannelNetwork());
  resetRuntimeDoubles();
  const run = await prepareDiscoveryJourney({ network: fakeNetwork(), ...options });
  run.world.publishDay(0, JOURNEY_START.toISOString());
  return run;
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
    const second = await refillDiscoveryPool({ force: true, now: JOURNEY_START });
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
   * FINDING (2026-08-17, spec 053 T9). The per-channel minimum interval is not enforced across
   * restocks. ChannelFetcher keeps it in a FetchBudgetLedger that lives on the fetcher instance,
   * and discoveryChannels.resolveAccess builds a brand new ChannelFetcher for every poll, so the
   * ledger is empty every time. What survives in channel_state is the failure backoff and the
   * daily budget — not the last-poll instant the interval check needs (isSourceAvailableNow never
   * looks at fetchPolicy.minimumIntervalMilliseconds). Five forced restocks in the same second
   * therefore send five polls to every source, where the catalog says at most one per 30 minutes.
   * Spec 053 §2 lists 每渠道限频 as a hard requirement; the daily budget is the only thing
   * actually stopping a runaway.
   */
  it.fails("waits out a channel's minimum interval between polls", async () => {
    const run = await freshRun();
    run.network.clearRequests();
    for (let round = 0; round < 5; round += 1) {
      await (await refillDiscoveryPool({ force: true, now: JOURNEY_START })).backgroundWork;
    }
    expect(run.network.requestsFor(topicFeedByKey("compilers").feedUrl).length).toBe(1);
  }, 60_000);

  /**
   * FINDING (2026-08-17, spec 053 T9). Active recall sends the reader's own subscription
   * addresses to third-party search APIs. Cards from a reader-added feed are filed under the
   * topic label discoveryPoolLanding falls back to when a source is not in the shipped catalog —
   * the raw source id, which for a pasted feed is `user-feed:<the whole URL>`. selectRecallTerms
   * then takes the reader's highest-weighted topics as literal search terms, so
   * `query=user-feed%3Ahttps%3A%2F%2F…` goes out to Hacker News / arXiv / iTunes. It leaks what
   * the reader subscribes to, and it burns queries out of the day's budget of twelve on a term
   * that can never match anything.
   */
  it.fails("never sends anything but a topic to a third-party search API", async () => {
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
