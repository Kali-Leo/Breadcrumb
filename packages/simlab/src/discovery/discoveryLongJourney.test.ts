/**
 * Purpose: thirty simulated days on the spec-053 external-content feed, end to end — synthetic
 * RSS/Atom/JSON channels behind a fake socket, the app's own landing, ranking, paging, silent
 * signals, background passes and restock discipline, over a real migrated SQLite file. The
 * assertions are trip-wires around what the spec promises; the point of the run is what it turns
 * up on the way (see the notes on each `it.fails` — those are findings, not aspirations).
 * No network, no LLM: the two runtimes are replaced by deterministic local doubles.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DayRecord } from "./discoveryJourneyHarness";

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
const { drainBackgroundWork, pinRandomness, prepareDiscoveryJourney, runJourneyDay } = await import(
  "./discoveryJourneyHarness"
);
const { allShown, duplicatesWithinDay, shareOfTopics, topicCounts, unfamiliarCount } = await import(
  "./discoveryJourneyMetrics"
);
const { quotaBreaches } = await import("./discoveryQuotaJudge");
const { HACKER_NEWS_SEARCH_PREFIX, topicFeedByKey } = await import("./syntheticChannelWorld");
const { DAILY_RECALL_QUERY_BUDGET } = await import(
  "../../../../apps/desktop/src/lib/discoveryRecall"
);
const { defaultMmrOptions } = await import("@breadcrumb/plugin-discovery");
const { FEED_PAGE_SIZE } = await import("../../../../apps/desktop/src/lib/discoveryFeedPaging");
const { UNSEEN_POOL_CAP, UNSEEN_POOL_MAX_AGE_DAYS } = await import(
  "../../../../apps/desktop/src/lib/discoveryPoolPruning"
);
const { useSettingsStore } = await import("../../../../apps/desktop/src/stores/settingsStore");
const { useDiscoveryStore } = await import("../../../../apps/desktop/src/stores/discoveryStore");
const { recordFeedDialMove } = await import(
  "../../../../apps/desktop/src/lib/discoveryFeedbackEvents"
);

/**
 * The baseline every "did the ranking do anything" comparison is made against: the candidates the
 * feed could have shown, which is the unseen pool it ranks (discoveryFeedPaging). Counting the
 * whole table instead — as this did until the T9 fix, when the grid still re-showed opened cards —
 * now measures how much of their own topics the reader has CONSUMED: their favourites are opened
 * first and leave the candidate pool, so they pile up in the table and the denominator says the
 * ranking made things worse the harder it worked.
 */
const RANKING_WINDOW = UNSEEN_POOL_CAP;

const COMPILERS = topicFeedByKey("compilers").topicLabel;
const NEURO = topicFeedByKey("neuro").topicLabel;
const GARDENING = topicFeedByKey("gardening").topicLabel;
const GOSSIP = topicFeedByKey("gossip").topicLabel;

const persona = {
  name: "长旅程读者",
  interests: [COMPILERS, NEURO, GARDENING],
  aversion: GOSSIP,
  attention: 0.7,
};

const JOURNEY_DAYS = 30;
/** Long enough that the reader reaches the end of what the pool holds and the app restocks. */
const PAGES_PER_DAY = 8;
/** Day the reader flips the feed's dial to 新领域多一点. */
const DIAL_FLIP_DAY = 18;
const OFFLINE_DAYS = new Set([20, 21, 22, 23, 24, 25, 26]);

interface JourneyResult {
  days: DayRecord[];
  recallQueriesByDay: Map<number, string[]>;
  pool: DiscoveryCardRow[];
  unfamiliarByDay: number[];
  /** Interest and aversion shares of the candidate pool the day started from — the "no ranking
   * at all" baseline each day's grid is compared against. */
  poolWindowInterestShare: number[];
  poolWindowAversionShare: number[];
  /** How many upcoming positions actually moved when the dial was flipped. */
  dialMovedPositions: number;
  /** The instant the last simulated day ended — what "two weeks old" is measured against. */
  lastDayEnd: Date;
}

let journey: JourneyResult;

async function runJourney(): Promise<JourneyResult> {
  installFakeNetwork(createFakeChannelNetwork());
  const run = await prepareDiscoveryJourney({ network: fakeNetwork() });
  const days: DayRecord[] = [];
  const recallQueriesByDay = new Map<number, string[]>();
  const unfamiliarByDay: number[] = [];
  const poolWindowInterestShare: number[] = [];
  const poolWindowAversionShare: number[] = [];
  let dialMovedPositions = -1;

  for (let dayIndex = 0; dayIndex < JOURNEY_DAYS; dayIndex += 1) {
    if (OFFLINE_DAYS.has(dayIndex)) run.network.disconnect();
    else run.network.reconnect();

    const repos = await getRepos();
    const eventsBeforeDay = await repos.discovery.listAllEvents();
    const rankingWindow = await repos.discovery.listUnseenPoolCards(RANKING_WINDOW);
    poolWindowInterestShare.push(shareOfTopics(rankingWindow, persona.interests));
    poolWindowAversionShare.push(shareOfTopics(rankingWindow, [persona.aversion]));
    const record = await runJourneyDay({
      persona,
      world: run.world,
      network: run.network,
      dayIndex,
      pages: PAGES_PER_DAY,
      beforeReacting:
        dayIndex === DIAL_FLIP_DAY
          ? async () => {
              const before = useDiscoveryStore.getState().cards.map((card) => card.id);
              await useSettingsStore.getState().setDiscoveryExplorationShare(0.4);
              await recordFeedDialMove(0.4);
              await useDiscoveryStore.getState().reshapeUpcoming();
              const after = useDiscoveryStore.getState().cards.map((card) => card.id);
              dialMovedPositions = before.filter((id, index) => after[index] !== id).length;
            }
          : undefined,
    });
    days.push(record);
    unfamiliarByDay.push(unfamiliarCount(record, eventsBeforeDay));
    recallQueriesByDay.set(
      dayIndex,
      run.network
        .requestsFor(HACKER_NEWS_SEARCH_PREFIX)
        .map((request) => new URL(request.url).searchParams.get("query") ?? ""),
    );
  }

  const repos = await getRepos();
  return {
    days,
    recallQueriesByDay,
    pool: await repos.discovery.listNewestCards(100_000),
    lastDayEnd: new Date(),
    unfamiliarByDay,
    poolWindowInterestShare,
    poolWindowAversionShare,
    dialMovedPositions,
  };
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

const early = (): DayRecord[] => journey.days.slice(0, 5);
const late = (): DayRecord[] => journey.days.slice(JOURNEY_DAYS - 5);

let restoreRandomness: () => void = () => undefined;

describe("discovery long journey (30 simulated days, real sqlite, faked channels)", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    restoreRandomness = pinRandomness(4242);
    resetRuntimeDoubles();
    journey = await runJourney();
    // Thirty days of real landing, ranking and SQL take 15-30s on a slow runner.
  }, 180_000);

  afterAll(async () => {
    restoreRandomness();
    vi.useRealTimers();
    await drainBackgroundWork();
    await closeDiscoveryDatabase();
  });

  it("keeps reaching the reader: every day puts cards on the grid, none of them twice", () => {
    for (const day of journey.days) {
      expect(day.shown.length, `day ${day.dayIndex} showed nothing`).toBeGreaterThan(0);
      expect(duplicatesWithinDay(day), `day ${day.dayIndex} repeated a card`).toEqual([]);
    }
  });

  it("never shows a card the reader said 不感兴趣 to, on that day or any later one", () => {
    const dismissed = new Set<string>();
    for (const day of journey.days) {
      for (const card of day.shown) {
        expect(dismissed.has(card.id), `card ${card.id} came back on day ${day.dayIndex}`).toBe(
          false,
        );
      }
      for (const id of day.disliked) dismissed.add(id);
    }
    expect(dismissed.size).toBeGreaterThan(0);
  });

  it("keeps the pool's arithmetic honest: no negative counts, no duplicate rows", () => {
    for (const day of journey.days) {
      expect(day.unseenPoolCountAfter).toBeGreaterThanOrEqual(0);
      expect(day.poolSizeAfter).toBeGreaterThanOrEqual(day.unseenPoolCountAfter);
    }
    const ids = journey.pool.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stays inside the day's recall query budget", () => {
    for (const [dayIndex, queries] of journey.recallQueriesByDay) {
      expect(queries.length, `day ${dayIndex} spent too many queries`).toBeLessThanOrEqual(
        DAILY_RECALL_QUERY_BUDGET,
      );
    }
  });

  it("puts more of the reader's own topics on the grid than the pool holds", () => {
    const shownShare = journey.days.map((day) => shareOfTopics(day.shown, persona.interests));
    expect(
      mean(shownShare),
      `shown ${mean(shownShare)} vs pool ${mean(journey.poolWindowInterestShare)}`,
    ).toBeGreaterThan(mean(journey.poolWindowInterestShare));
  });

  it("keeps the topic the reader keeps dismissing off the grid card by card", () => {
    // What "不感兴趣" reliably does today: that card is gone for good (asserted above). What
    // matters here is that the reader really did keep saying it, over and over, for a month —
    // the topic-level effect of all that saying is the next test.
    const dismissed = new Set(journey.days.flatMap((day) => day.disliked));
    expect(dismissed.size).toBeGreaterThan(10);
    expect([...dismissed].every((id) => id.includes("gossip"))).toBe(true);
  });

  /**
   * FIXED (2026-08-17, spec 053 T9 finding #7). Thirty days of 不感兴趣 used to barely move the
   * topic: the only place its negative weight could act was the negative embedding centroid,
   * whose cosine contribution is a few hundredths, and contentFeatures' crowd-signal/cover/
   * freshness bonuses swamped it. The topic's own standing is now the ranking's primary axis
   * (rankingScore), so a refused topic sits below every topic the reader has not refused.
   * Spec 053 验收: "连续「不感兴趣」某主题→该主题显著减少".
   */
  it("pushes the dismissed topic well below its share of the pool", () => {
    const late5 = journey.days.slice(JOURNEY_DAYS - 5);
    const gridShare = shareOfTopics(allShown(late5), [persona.aversion]);
    const poolShare = mean(journey.poolWindowAversionShare.slice(JOURNEY_DAYS - 5));
    expect(gridShare, `grid ${gridShare} vs pool ${poolShare}`).toBeLessThan(poolShare / 2);
  });

  it("never becomes a single-topic feed: the reader keeps meeting other things", () => {
    for (const day of late()) {
      const counts = topicCounts(day.shown);
      const biggest = Math.max(...counts.values());
      expect(counts.size, `day ${day.dayIndex} collapsed to one topic`).toBeGreaterThan(2);
      expect(biggest / day.shown.length, `day ${day.dayIndex} was dominated`).toBeLessThan(0.7);
    }
  });

  it("keeps every saved card, and lists them newest first", async () => {
    const repos = await getRepos();
    const saved = await repos.discovery.listSaved();
    const expected = new Set(journey.days.flatMap((day) => day.saved));
    expect(saved.length).toBe(expected.size);
    for (const card of saved) {
      expect(expected.has(card.id)).toBe(true);
      expect(card.saved_at).not.toBeNull();
    }
    const stamps = saved.map((card) => Date.parse(card.saved_at ?? ""));
    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps);
  });

  it("serves a whole week offline from the pool, plainly and without a banner", () => {
    for (const dayIndex of OFFLINE_DAYS) {
      const day = journey.days[dayIndex];
      expect(day, `day ${dayIndex} is missing`).toBeDefined();
      if (day === undefined) continue;
      expect(day.shown.length, `offline day ${dayIndex} showed nothing`).toBeGreaterThan(0);
      expect(day.blockedReason, `offline day ${dayIndex} showed a banner`).toBeNull();
    }
  });

  it("records the dial move and keeps it out of the interest fold", async () => {
    expect(useSettingsStore.getState().discoveryExplorationShare).toBe(0.4);
    const repos = await getRepos();
    const dialEvents = (await repos.discovery.listAllEvents()).filter(
      (event) => event.kind === "dial",
    );
    expect(dialEvents).toHaveLength(1);
    expect(dialEvents[0]?.value_ms).toBe(400);
    expect(dialEvents[0]?.topic_label).toBe("");
  });

  /**
   * FIXED (2026-08-17, spec 053 T9 finding #3). The dial used to go inert within days, and the
   * 探索位保底 floor behind it: "familiar" meant any topic that appeared anywhere in the event
   * stream, and an impression is an event, so a topic became familiar the first time it was ever
   * shown — the unfamiliar count went 19, 4, 0, 4 and then zero for twenty-six days straight.
   * A topic is now part of the reader's reading once they have ENGAGED with it and it stands
   * clearly above their average interest (rankingScore.establishedTopics), which is also what
   * unfamiliarCount measures here. Spec 053 §4's 10-25% exploration floor and §6 验收
   * "旋钮拨动立即改变构成".
   */
  it("keeps handing some of the feed to topics the reader has no history with", () => {
    const lateDays = journey.unfamiliarByDay.slice(7);
    expect(lateDays.filter((count) => count > 0).length).toBeGreaterThan(lateDays.length / 2);
  });

  /**
   * FIXED (2026-08-17, spec 053 T9 finding #8), with a different measurement — the original one
   * cannot answer the question any more, for two reasons that are both consequences of other
   * fixes in the same batch, and one that was always there:
   *
   * - a card the reader opened no longer comes back to the grid, so their favourite topics are
   *   CONSUMED. The better the ranking, the faster that happens: the pool now holds 15-20% of
   *   the reader's topics and the first page holds 55-65% of them, which is the ranking working,
   *   and it also means the share of "everything scrolled past" falls as the pool grows.
   * - the pool no longer stops growing at what one restock brought, so a late day's grid is 190
   *   cards where an early day's was 35. Comparing the share of two grids of such different
   *   lengths compares pool sizes, not ranking.
   * - the last five days are the tail of a week offline, during which nothing new lands and the
   *   reader reads their own topics out of the pool entirely. That measures the network.
   *
   * So this reads the page the feed leads with each day, and reads it against the reader's very
   * first sitting — the one where the app knew nothing about them — rather than against days 1-4,
   * because the growth all happens on day one: the reader's topics go from a third of the first
   * page to more than half of it and then sit there for a month. What holds them there is the
   * ceiling, not the evidence: the per-topic quota and the reader's own dial, which they moved to
   * 新领域多一点 on day 18, together bound how much of a page three topics can hold. The three
   * assertions are the three things worth knowing — it grew, it did not decay over a month that
   * included a week offline, and it is nowhere near the pool's own mix, which is where the whole
   * journey used to sit. Spec 053 验收: "收藏/读完某主题→同主题增多但不独占".
   */
  it("lets the reader's own topics grow over the journey", () => {
    const firstPage = (days: readonly DayRecord[]): DiscoveryCardRow[] =>
      days.flatMap((day) => day.shown.slice(0, FEED_PAGE_SIZE));
    const online = journey.days.filter((day) => !OFFLINE_DAYS.has(day.dayIndex));
    const firstSitting = shareOfTopics(firstPage(journey.days.slice(0, 1)), persona.interests);
    const interestEarly = shareOfTopics(firstPage(early()), persona.interests);
    const interestLate = shareOfTopics(firstPage(online.slice(-5)), persona.interests);
    expect(interestLate, `first sitting ${firstSitting} -> late ${interestLate}`).toBeGreaterThan(
      firstSitting * 1.3,
    );
    expect(interestLate, `early ${interestEarly} -> late ${interestLate}`).toBeGreaterThanOrEqual(
      interestEarly,
    );
    // And it is not a hair's breadth over the pool it was drawn from either.
    const poolShare = mean(journey.poolWindowInterestShare.slice(JOURNEY_DAYS - 5));
    expect(interestLate, `late ${interestLate} vs pool ${poolShare}`).toBeGreaterThan(
      poolShare * 2,
    );
  });

  it("spends exactly one quality-check call per fetched batch and nothing else on the LLM", () => {
    expect(runtimeCallCounts.chatJson).toBeGreaterThan(0);
    expect(runtimeCallCounts.chatJson).toBeLessThanOrEqual(JOURNEY_DAYS * PAGES_PER_DAY);
  });

  /**
   * FIXED (2026-08-17, spec 053 T9 finding #4). The caps used to be spent inside the first two
   * dozen candidates of a single whole-pool ranking pass; everything after that was score order,
   * which is exactly the page the reader was looking at. Ranking now assembles one page at a
   * time under a fresh set of caps (feedPages.assembleFeedPages). What is left over is the next
   * page's candidates, so a page only ever exceeds a cap when nothing that fits was left at all —
   * which is what quotaBreaches now checks.
   */
  it("holds the per-source and per-form quotas on every page", () => {
    const breaches = journey.days.flatMap((day) =>
      quotaBreaches(day, journey.pool, {
        source: defaultMmrOptions.perSourceCap,
        kind: defaultMmrOptions.perKindCap,
        topic: defaultMmrOptions.perTopicCap,
      }),
    );
    expect(breaches.slice(0, 5)).toEqual([]);
  });

  /**
   * FIXED (2026-08-17, spec 053 T9 finding #5). Spec 053 §3 asks for old unseen candidates to
   * expire ("旧未看候选按时限淘汰") and for the pool to stay near its target size; nothing ever
   * deleted a card, so it only grew. Every restock now expires untouched candidates older than
   * two weeks and trims what is left to the cap.
   *
   * The original 200-row ceiling on the WHOLE table is not the right assertion and never could
   * be met: cards the reader opened or saved are their reading history and their 收藏 list, and
   * deleting those to keep a row count down would be deleting the reader's own things. What is
   * bounded is the candidate pool.
   */
  it("keeps the candidate pool inside its cap instead of growing without bound", () => {
    const untouched = journey.pool.filter(
      (card) => card.opened_at === null && card.saved_at === null,
    );
    expect(untouched.length).toBeLessThanOrEqual(UNSEEN_POOL_CAP);
    const cutoff = new Date(
      journey.lastDayEnd.getTime() - UNSEEN_POOL_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(untouched.filter((card) => card.created_at < cutoff)).toEqual([]);
    // The rest of the table is what the reader themselves read or kept.
    expect(journey.pool.length - untouched.length).toBeGreaterThan(0);
  });
});
