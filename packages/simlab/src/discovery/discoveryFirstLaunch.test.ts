/**
 * Purpose: the first launch of a fresh install, in the order it actually happens — the app
 * restocks a few seconds after start, before the reader has typed an API key or answered the
 * first-run panel, and only then does the reader get to say anything. Both of the passes that
 * depend on the reader having said something used to be spent on that empty first round and never
 * ran again (spec 053 T10b): the day's active recall, and the batch quality check over the first
 * hundred cards. This is the journey that catches either of them regressing.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
const { drainBackgroundWork, JOURNEY_START, pinRandomness, prepareDiscoveryJourney } = await import(
  "./discoveryJourneyHarness"
);
const { HACKER_NEWS_SEARCH_PREFIX, TOPIC_FEEDS } = await import("./syntheticChannelWorld");
const { QUALITY_CHECK_BATCH_CAP } = await import("@breadcrumb/plugin-discovery");
const { recordOnboardingStances } = await import(
  "../../../../apps/desktop/src/lib/discoveryFeedbackEvents"
);
const { ONBOARDING_FIELDS } = await import("../../../../apps/desktop/src/lib/discoveryOnboarding");
const { runRefill } = await import("../../../../apps/desktop/src/lib/discoveryRestockTask");
const { useDiscoveryStore } = await import("../../../../apps/desktop/src/stores/discoveryStore");
const { useSettingsStore } = await import("../../../../apps/desktop/src/stores/settingsStore");

const WANTED = ["编程与技术", "科学"] as const;

interface FirstLaunch {
  poolAfterBoot: number;
  unratedAfterBoot: number;
  unratedBeforeKey: number;
  llmCallsAfterBoot: number;
  searchQueriesAfterBoot: string[];
  searchQueriesAfterPanel: string[];
  unratedByPass: number[];
  llmCallsAfterPasses: number;
}

let launch: FirstLaunch;
let restoreRandomness: () => void = () => undefined;

async function unratedPoolCards(): Promise<number> {
  const repos = await getRepos();
  const pool = await repos.discovery.listNewestCards(10_000);
  return pool.filter((card) => card.quality_score === null).length;
}

function searchQueries(): string[] {
  return fakeNetwork()
    .requestsFor(HACKER_NEWS_SEARCH_PREFIX)
    .map((request) => new URL(request.url).searchParams.get("query") ?? "");
}

describe("discovery first launch (no key yet, panel not answered yet)", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    restoreRandomness = pinRandomness(4242);
    vi.setSystemTime(JOURNEY_START);
    resetRuntimeDoubles();
    installFakeNetwork(createFakeChannelNetwork());
    // The big catalog: one round lands more cards than a single quality-check batch holds, which
    // is what makes "the backlog drains over several passes" a real question.
    const run = await prepareDiscoveryJourney({ network: fakeNetwork(), feeds: TOPIC_FEEDS });
    // A fresh install has no API key. The 质检 switch is on — it is on by default — so the check
    // is asked for and quietly answers nothing until there is a provider to ask.
    useSettingsStore.setState({ apiConfig: null });
    run.world.publishDay(0, JOURNEY_START.toISOString());
    run.network.clearRequests();

    // 1. The app starts and restocks behind the (still unopened) feed.
    await useDiscoveryStore.getState().refillPool();
    await drainBackgroundWork();
    const repos = await getRepos();
    const bootPool = await repos.discovery.listNewestCards(10_000);
    const unratedAfterBoot = await unratedPoolCards();

    // 2. The reader answers the first-run panel, and the app goes looking for what they said.
    await recordOnboardingStances(
      ONBOARDING_FIELDS.map((field) => ({
        topicLabel: field,
        stance: WANTED.includes(field as (typeof WANTED)[number])
          ? ("want" as const)
          : ("neutral" as const),
      })),
    );
    const searchQueriesAfterBoot = searchQueries();
    await useDiscoveryStore.getState().refillPool({ forceRecall: true });
    await drainBackgroundWork();
    const searchQueriesAfterPanel = searchQueries().slice(searchQueriesAfterBoot.length);

    // 3. The reader enters an API key. Every later restock — including the ones that find the
    // pool already stocked — works through the cards nobody could rate at launch.
    const llmCallsAfterBoot = runtimeCallCounts.chatJson;
    const unratedBeforeKey = await unratedPoolCards();
    useSettingsStore.setState({
      apiConfig: { baseUrl: "https://provider.invalid", apiKey: "k", model: "deepseek-v4-flash" },
    });
    const unratedByPass: number[] = [];
    for (let pass = 0; pass < 2; pass += 1) {
      await (await runRefill()).backgroundWork;
      unratedByPass.push(await unratedPoolCards());
    }

    launch = {
      poolAfterBoot: bootPool.length,
      unratedAfterBoot,
      unratedBeforeKey,
      llmCallsAfterBoot,
      searchQueriesAfterBoot,
      searchQueriesAfterPanel,
      unratedByPass,
      llmCallsAfterPasses: runtimeCallCounts.chatJson,
    };
  }, 180_000);

  afterAll(async () => {
    restoreRandomness();
    vi.useRealTimers();
    await drainBackgroundWork();
    await closeDiscoveryDatabase();
  });

  it("fills the pool at launch without a key and without a word from the reader", () => {
    expect(launch.poolAfterBoot).toBeGreaterThan(50);
  });

  /**
   * FIXED (2026-08-17, spec 053 T10b). The launch restock ran active recall over a library with
   * nothing in it, spent nothing, and marked the day as asked; the restock right after the reader
   * answered the panel found the day already spent and searched for none of the fields they had
   * just chosen. Day one now searches for them.
   */
  it("searches for the fields the reader chose, on the same day it asked", () => {
    expect(launch.searchQueriesAfterBoot).toEqual([]);
    expect(launch.searchQueriesAfterPanel.length).toBeGreaterThan(0);
    expect(
      launch.searchQueriesAfterPanel.some((query) => WANTED.includes(query as never)),
      launch.searchQueriesAfterPanel.join(" | "),
    ).toBe(true);
  });

  /**
   * FIXED (2026-08-17, spec 053 T10b). The quality check rated the batch that had just landed and
   * nothing else, and the batch that lands seconds after a first launch cannot be rated at all —
   * there is no provider configured yet. Those cards stayed unrated for as long as they were in
   * the pool. The pass reads the pool's unrated backlog now, so the first passes that run with a
   * key work through it, one batch per pass.
   */
  it("rates nothing before there is a key, and drains the backlog once there is one", () => {
    expect(launch.llmCallsAfterBoot).toBe(0);
    expect(launch.unratedAfterBoot).toBe(launch.poolAfterBoot);
    expect(launch.unratedBeforeKey).toBeGreaterThan(QUALITY_CHECK_BATCH_CAP);
    // One batch per pass, and the second pass reaches the cards the first one could not hold.
    expect(launch.unratedByPass[0]).toBe(launch.unratedBeforeKey - QUALITY_CHECK_BATCH_CAP);
    expect(launch.unratedByPass[1]).toBe(0);
    expect(launch.llmCallsAfterPasses).toBe(2);
  });
});
