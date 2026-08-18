/**
 * Purpose: the first run — an empty library, the first-run panel's 想看/一般/不想看 positions and
 * nothing else. Checks what spec 053 §6/验收 promise about a cold start: the fields the reader
 * said 想看 to steer what the app goes looking for, the ones they said 不想看 to are not searched
 * for, and the first page is not narrowed down to the chosen fields.
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
const { resetRuntimeDoubles } = await import("./desktopRuntimeDoubles");
const {
  drainBackgroundWork,
  JOURNEY_START,
  pinRandomness,
  prepareDiscoveryJourney,
  runJourneyDay,
} = await import("./discoveryJourneyHarness");
const { HACKER_NEWS_SEARCH_PREFIX, topicFeedByKey } = await import("./syntheticChannelWorld");
const { recordOnboardingStances, hasRecordedOnboardingStances } = await import(
  "../../../../apps/desktop/src/lib/discoveryFeedbackEvents"
);
const { ONBOARDING_FIELDS } = await import("../../../../apps/desktop/src/lib/discoveryOnboarding");
const { FEED_PAGE_SIZE } = await import("../../../../apps/desktop/src/lib/discoveryFeedPaging");

const WANTED = ["编程", "科学"] as const;
const AVOIDED = "历史";

const persona = {
  name: "第一次打开的读者",
  interests: [topicFeedByKey("compilers").topicLabel],
  aversion: topicFeedByKey("gossip").topicLabel,
  attention: 0.5,
};

interface ColdStart {
  firstPage: { topic: string }[];
  recallQueries: string[];
}

let coldStart: ColdStart;

let restoreRandomness: () => void = () => undefined;

describe("discovery cold start (empty library, first-run stances only)", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    restoreRandomness = pinRandomness(1337);
    vi.setSystemTime(JOURNEY_START);
    resetRuntimeDoubles();
    installFakeNetwork(createFakeChannelNetwork());
    const run = await prepareDiscoveryJourney({ network: fakeNetwork() });

    // The panel, answered: two fields 想看, one 不想看, everything else left at 一般.
    await recordOnboardingStances(
      ONBOARDING_FIELDS.map((field) => ({
        topicLabel: field,
        stance: WANTED.includes(field as (typeof WANTED)[number])
          ? ("want" as const)
          : field === AVOIDED
            ? ("avoid" as const)
            : ("neutral" as const),
      })),
    );

    const day = await runJourneyDay({
      persona,
      world: run.world,
      network: run.network,
      dayIndex: 0,
      pages: 1,
    });
    coldStart = {
      firstPage: day.shown.slice(0, FEED_PAGE_SIZE).map((card) => ({ topic: card.topic_label })),
      recallQueries: run.network
        .requestsFor(HACKER_NEWS_SEARCH_PREFIX)
        .map((request) => new URL(request.url).searchParams.get("query") ?? ""),
    };
  }, 120_000);

  afterAll(async () => {
    restoreRandomness();
    vi.useRealTimers();
    await drainBackgroundWork();
    await closeDiscoveryDatabase();
  });

  it("remembers that the panel was answered", async () => {
    expect(await hasRecordedOnboardingStances()).toBe(true);
    const repos = await getRepos();
    const stances = (await repos.discovery.listAllEvents()).filter(
      (event) => event.kind === "onboarding",
    );
    // 一般 says nothing and is not written down at all.
    expect(stances).toHaveLength(WANTED.length + 1);
    // listAllEvents orders by (created_at, id); these three rows share an instant and carry random
    // uuids, so the set is the assertion, not the order.
    expect(
      new Set(stances.filter((event) => (event.value_ms ?? 0) > 0).map((e) => e.topic_label)),
    ).toEqual(new Set(WANTED));
  });

  it("goes looking for the fields the reader said 想看 to", () => {
    expect(coldStart.recallQueries.length).toBeGreaterThan(0);
    expect(coldStart.recallQueries.some((query) => WANTED.includes(query as never))).toBe(true);
  });

  /**
   * FIXED (2026-08-17, spec 053 T9 finding #2). The first thing the app used to do with a 不想看
   * answer was go looking for it: pickExploreTopics sampled Beta(opens+1, dislikes+1) over every
   * topic in the event stream, including the ones whose only evidence was the reader saying no,
   * and on a cold start those are the only topics there are. An arm with no positive evidence
   * and at least one refusal is now left out of the draw entirely (thompson.ts).
   */
  it("never searches for a field the reader said 不想看 to", () => {
    expect(coldStart.recallQueries).not.toContain(AVOIDED);
  });

  it("fills the first page without narrowing it to the chosen fields", () => {
    expect(coldStart.firstPage.length).toBe(FEED_PAGE_SIZE);
    const topics = new Set(coldStart.firstPage.map((card) => card.topic));
    const wantedOnPage = coldStart.firstPage.filter((card) => WANTED.includes(card.topic as never));
    expect(topics.size, [...topics].join(" | ")).toBeGreaterThan(2);
    expect(wantedOnPage.length / coldStart.firstPage.length).toBeLessThan(0.8);
  });

  it("leans the first page toward the fields the reader said 想看 to", () => {
    const wantedOnPage = coldStart.firstPage.filter((card) => WANTED.includes(card.topic as never));
    expect(wantedOnPage.length / coldStart.firstPage.length).toBeGreaterThan(0.25);
  });
});
