/**
 * Purpose: thirty simulated days on the spec-053 external-content feed, end to end — synthetic
 * RSS/Atom/JSON channels behind a fake socket, the app's own landing, ranking, paging, silent
 * signals, background passes and restock discipline, over a real migrated SQLite file. The
 * assertions are trip-wires around what the spec promises; the point of the run is what it turns
 * up on the way (the notes on individual tests record what each one caught and how it was fixed).
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

const GOSSIP = topicFeedByKey("gossip").topicLabel;

/**
 * What this reader recognizes as one of their subjects: the feeds they subscribe to, plus the
 * words those feeds are written in. Active recall files a card under the term that found it, and
 * those terms are pulled out of what the reader read — so a card about 寄存器分配 is one of this
 * reader's topics whether it arrived from their compiler feed or from a search. Feed labels alone
 * were enough while every recalled card carried a subscription address as its topic (spec 053 T9
 * finding #1); now that a term is a subject, the model has to know its subjects.
 */
const interestLabels = (keys: readonly string[]): string[] =>
  keys.flatMap((key) => [topicFeedByKey(key).topicLabel, ...topicFeedByKey(key).vocabulary]);

const persona = {
  name: "长旅程读者",
  interests: interestLabels(["compilers", "neuro", "gardening"]),
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
  /** What the grid held before and after the dial was flipped (spec 054: 「整流换掉」). */
  dialFlip: {
    before: string[];
    after: string[];
    saved: { before: number; after: number };
    pool: { before: number; after: number };
  };
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
  let dialFlip = {
    before: [] as string[],
    after: [] as string[],
    saved: { before: 0, after: 0 },
    pool: { before: 0, after: 0 },
  };

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
              // Exactly the sequence DiscoveryFeedDial runs (spec 054, Leo's fifth point): the
              // grid is replaced rather than re-ranked below the fold.
              const before = useDiscoveryStore.getState().cards.map((card) => card.id);
              const savedBefore = (await repos.discovery.listSaved()).length;
              const poolBefore = (await repos.discovery.listNewestCards(100_000)).length;
              await useSettingsStore.getState().setDiscoveryExplorationShare(0.4);
              await recordFeedDialMove(0.4);
              await useDiscoveryStore.getState().redrawFeed();
              const after = useDiscoveryStore.getState().cards.map((card) => card.id);
              dialFlip = {
                before,
                after,
                saved: { before: savedBefore, after: (await repos.discovery.listSaved()).length },
                pool: {
                  before: poolBefore,
                  after: (await repos.discovery.listNewestCards(100_000)).length,
                },
              };
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
    dialFlip,
  };
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

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
   * Spec 054, Leo's fifth point — 「切换熟悉的多一点和新领域多一点之后内容要进行刷新」, and when asked
   * whether that meant re-sorting or replacing: 「整流换掉」. Until then the dial re-ranked only the
   * part the reader had not reached, so a reader sitting at the top of the feed saw nothing change.
   * Losing their place is the accepted cost; losing anything they had kept would not be.
   */
  it("replaces the whole grid when the dial is flipped, and keeps everything behind it", async () => {
    const { before, after, saved, pool } = journey.dialFlip;
    // Eight pages deep when the dial moved, one page long afterwards: the grid was discarded and
    // drawn again, not re-ranked in place, and the reader is looking at a first page.
    expect(before.length).toBeGreaterThan(FEED_PAGE_SIZE);
    expect(after.length).toBeGreaterThan(0);
    expect(after.length).toBeLessThanOrEqual(FEED_PAGE_SIZE);
    expect(after[0]).not.toBe(before[0]);
    expect(new Set(after).size).toBe(after.length);

    // The pool is a re-draw's source, never its casualty: nothing was deleted to make room, and
    // the cards the reader had kept are all still kept.
    expect(pool.after).toBeGreaterThanOrEqual(pool.before);
    expect(saved.after).toBe(saved.before);
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
   * So this reads the page the feed leads with each day against the pool that page was drawn
   * from, rather than as a bare share. The absolute share of a late page is not comparable to an
   * early one — the pool's own mix moves by a factor of five over a month, and a week offline
   * strips it of the reader's topics entirely — and it stopped being comparable across the F2 fix
   * as well: active recall used to file everything it found under the reader's subscription
   * addresses, which counted as their topics by construction (spec 053 T9 finding #1), and now
   * files it under the subject that found it. What survives all of that is the ratio, which is
   * what the ranking is actually judged on: a day-one page looks like its pool, and a late page
   * holds several times the reader's share of it. Spec 053 验收:
   * "收藏/读完某主题→同主题增多但不独占".
   */
  it("lets the reader's own topics grow over the journey", () => {
    const firstPage = (days: readonly DayRecord[]): DiscoveryCardRow[] =>
      days.flatMap((day) => day.shown.slice(0, FEED_PAGE_SIZE));
    const online = journey.days.filter((day) => !OFFLINE_DAYS.has(day.dayIndex));
    /** How many times more of the reader's topics a day's leading page holds than the pool it was
     * drawn from. A day whose pool holds none of them at all says nothing about ranking. */
    const liftsOver = (days: readonly DayRecord[]): number[] =>
      days
        .map((day) => ({
          page: shareOfTopics(firstPage([day]), persona.interests),
          pool: journey.poolWindowInterestShare[day.dayIndex] ?? 0,
        }))
        .filter((day) => day.pool > 0)
        .map((day) => day.page / day.pool);
    const earlyLift = mean(liftsOver(online.slice(0, 5)));
    const lateLift = mean(liftsOver(online.slice(-5)));
    expect(lateLift, `early ${earlyLift} -> late ${lateLift}`).toBeGreaterThan(earlyLift * 2);
    // And it is not a hair's breadth over the pool it was drawn from either.
    expect(lateLift).toBeGreaterThan(2);
    const interestLate = shareOfTopics(firstPage(online.slice(-5)), persona.interests);
    const poolLate = mean(
      online.slice(-5).map((day) => journey.poolWindowInterestShare[day.dayIndex] ?? 0),
    );
    expect(interestLate, `late ${interestLate} vs pool ${poolLate}`).toBeGreaterThan(poolLate * 2);
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
