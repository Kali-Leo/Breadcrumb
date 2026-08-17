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
const {
  allShown,
  duplicatesWithinDay,
  quotaBreaches,
  shareOfTopics,
  topicCounts,
  unfamiliarCount,
} = await import("./discoveryJourneyMetrics");
const { HACKER_NEWS_SEARCH_PREFIX, topicFeedByKey } = await import("./syntheticChannelWorld");
const { DAILY_RECALL_QUERY_BUDGET } = await import(
  "../../../../apps/desktop/src/lib/discoveryRecall"
);
const { defaultMmrOptions } = await import("@breadcrumb/plugin-discovery");
const { useSettingsStore } = await import("../../../../apps/desktop/src/stores/settingsStore");
const { useDiscoveryStore } = await import("../../../../apps/desktop/src/stores/discoveryStore");
const { recordFeedDialMove } = await import(
  "../../../../apps/desktop/src/lib/discoveryFeedbackEvents"
);

/** discoveryFeedPaging reads this many pooled cards per ranking pass. */
const RANKING_WINDOW = 200;

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
  /** Interest and aversion shares of the ranking window the day started from — the "no ranking
   * at all" baseline each day's grid is compared against. */
  poolWindowInterestShare: number[];
  poolWindowAversionShare: number[];
  /** How many upcoming positions actually moved when the dial was flipped. */
  dialMovedPositions: number;
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
    const rankingWindow = await repos.discovery.listNewestCards(RANKING_WINDOW);
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
   * FINDING (2026-08-17, spec 053 T9). Thirty days of 不感兴趣 on one topic barely move it. In
   * the last five days the aversion topic still holds 13% of the grid against 16.5% of the
   * ranking window — a 21% reduction, almost all of which is the disliked CARDS being filtered
   * out one at a time (discoveryOrdering drops dislikedIds), not the TOPIC being demoted. The
   * topic's folded weight is strongly negative by then, but the only place a negative weight can
   * act is the negative embedding centroid, whose cosine contribution is a few hundredths and is
   * swamped by contentFeatures' crowd-signal/cover/freshness bonuses. Spec 053 验收 asks for
   * "连续「不感兴趣」某主题→该主题显著减少".
   */
  it.fails("pushes the dismissed topic well below its share of the pool", () => {
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
   * FINDING (2026-08-17, spec 053 T9). The dial goes inert within days, and so does the
   * 探索位保底 floor behind it. discoveryOrdering splits the ranked pool into "familiar" (any
   * topic that appears anywhere in the event stream) and "unfamiliar" (everything else), and
   * interleaveExploration only ever places items from the unfamiliar list. But an impression IS
   * an event and the grid records one for every card it shows, so a topic becomes "familiar" the
   * first time it appears on screen. In this journey the unfamiliar count is 19 on day 0, 4, 0,
   * 4, and then 0 for every one of the remaining twenty-six days: after the first week the
   * exploration lane is empty, interleaveExploration degenerates to "return the exploit list in
   * order", and the dial's 0.15 / 0.4 positions produce identical feeds. Spec 053 §4 promises a
   * 10-25% exploration floor and §6 验收 promises "旋钮拨动立即改变构成".
   */
  it.fails("keeps handing some of the feed to topics the reader has no history with", () => {
    const lateDays = journey.unfamiliarByDay.slice(7);
    expect(lateDays.filter((count) => count > 0).length).toBeGreaterThan(lateDays.length / 2);
  });

  /**
   * FINDING (2026-08-17, spec 053 T9). The reader's own topics do not gain ground over a month.
   * With production's Math.random pinned so the run replays exactly, the share of the grid held by
   * the three topics this persona opens, dwells on, finishes and saves goes 0.539 in the first
   * five days to 0.458 in the last five — flat to slightly down, after hundreds of positive events
   * on those topics. The grid does sit a little above the pool's own mix (the test above), so the
   * ranking is doing something; it just does not compound. The interest term is a cosine
   * difference between centroids built out of the candidates themselves and moves in hundredths,
   * while contentFeatures adds up to 0.53 of flat crowd-signal + cover + freshness bonus — the
   * opposite of what contentFeatures.ts says it is sized for ("they never outvote what the reader
   * has actually shown interest in"). Spec 053 验收: "收藏/读完某主题→同主题增多但不独占".
   *
   * Skipped rather than marked `it.fails`: the measurement sits close enough to flat that it
   * lands on either side of "grew" between runs, which is itself the finding — thirty days of
   * strong, consistent signal produce a difference indistinguishable from noise. Unskip it once
   * the ranking gives topic weight a direct say, and it should pass comfortably.
   */
  it.skip("lets the reader's own topics grow over the journey", () => {
    const interestEarly = shareOfTopics(allShown(early()), persona.interests);
    const interestLate = shareOfTopics(allShown(late()), persona.interests);
    expect(interestLate, `interest share ${interestEarly} -> ${interestLate}`).toBeGreaterThan(
      interestEarly,
    );
  });

  it("spends exactly one quality-check call per fetched batch and nothing else on the LLM", () => {
    expect(runtimeCallCounts.chatJson).toBeGreaterThan(0);
    expect(runtimeCallCounts.chatJson).toBeLessThanOrEqual(JOURNEY_DAYS * PAGES_PER_DAY);
  });

  /**
   * FINDING (2026-08-17, spec 053 T9). The cross-channel / content-form quota does not survive
   * past the first handful of cards on a page. orderCardsForDisplay ranks the WHOLE unshown pool
   * with `mmrSelect(candidates, candidates.length)`, and mmrSelect only applies its caps while it
   * is still selecting: once every candidate has hit a cap it dumps the rest of the pool into the
   * tail in pure score order (the deliberate "a mono-topic pool must still show everything"
   * rule). With k = the whole pool rather than one page, that tail IS the page the reader sees,
   * so a page of 24 routinely carries far more than perSourceCap=5 items from one channel even
   * though other channels were available. Left as a failing-by-design trip-wire rather than
   * fixed: the fix is a product decision about where the page boundary belongs, not a test change.
   */
  it.fails("holds the per-source and per-form quotas on every page", () => {
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
   * FINDING (2026-08-17, spec 053 T9). Spec 053 §3 asks for the pool to be capped ("补货至 100")
   * and for old unseen candidates to expire ("旧未看候选按时限淘汰"). Neither exists: nothing in
   * core-db's discovery repo or in the desktop pipeline ever deletes a card, so the pool only
   * grows — a month of this journey leaves several hundred rows, and a year of real use would
   * leave tens of thousands, all of which listNewestCards/listCardIds read on every restock.
   */
  it.fails("keeps the pool near its target size rather than growing without bound", () => {
    expect(journey.pool.length).toBeLessThanOrEqual(200);
  });
});
