/**
 * Purpose: free hunting over the spec-053 feed — seeded-random action sequences against
 * seeded-random hostile feeds, looking for anything the pipeline is not supposed to do: a thrown
 * exception anywhere, the same card on the grid twice, an event with an impossible value, a
 * negative pool count, a ranking that dies on an empty or all-unembedded pool, or hostile markup
 * surviving into a card's title or hook. Every failure prints the seed that produced it, which is
 * all that is needed to replay it.
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
  resetFeedSession,
} = await import("./discoveryJourneyHarness");
const { HOSTILE_FEED_URLS, plantHostileWorld } = await import("./hostileWorld");
const { useDiscoveryStore } = await import("../../../../apps/desktop/src/stores/discoveryStore");
const { useSettingsStore } = await import("../../../../apps/desktop/src/stores/settingsStore");
const { orderCardsForDisplay } = await import("../../../../apps/desktop/src/lib/discoveryOrdering");
const { mulberry32, randomInt } = await import("../util/prng");
const { checkPipelineInvariants, findLiveMarkupCards } = await import(
  "./discoveryHuntingInvariants"
);
const { buildRssFeed } = await import("./syntheticFeeds");
const { runRandomFeedSession } = await import("./discoveryHuntingSession");

/** Enough seeds to shake out shape bugs while the whole file stays inside a minute. */
const SEED_COUNT = 24;

let restoreRandomness: () => void = () => undefined;

describe("discovery free hunting (seeded random actions over hostile feeds)", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    restoreRandomness = pinRandomness(24601);
    vi.setSystemTime(JOURNEY_START);
  });
  afterAll(async () => {
    restoreRandomness();
    vi.useRealTimers();
    await drainBackgroundWork();
    await closeDiscoveryDatabase();
  });

  it("survives every seeded action sequence over every kind of broken feed", async () => {
    for (let seed = 1; seed <= SEED_COUNT; seed += 1) {
      const random = mulberry32(seed * 2654435761);
      resetRuntimeDoubles();
      installFakeNetwork(createFakeChannelNetwork());
      const feedCount = randomInt(random, 1, HOSTILE_FEED_URLS.length);
      const run = await prepareDiscoveryJourney({
        network: fakeNetwork(),
        includeHackerNews: random() < 0.5,
        feeds: [],
        // The reader pasted these addresses in themselves.
        extraFeedUrls: HOSTILE_FEED_URLS.slice(0, feedCount),
      });
      await useSettingsStore
        .getState()
        .setDiscoveryExplorationShare(0.1 + randomInt(random, 0, 4) / 10);
      const planted = plantHostileWorld(run.network, { random, feedCount });

      let report: Awaited<ReturnType<typeof runRandomFeedSession>>;
      try {
        report = await runRandomFeedSession({ random, network: run.network, planted });
      } catch (error) {
        throw new Error(`seed ${seed} threw: ${String(error)}`, { cause: error });
      }

      const repos = await getRepos();
      const problems = await checkPipelineInvariants({
        repos,
        displayed: report.displayed,
      });
      expect(problems, `seed ${seed}: ${problems.join(" | ")}`).toEqual([]);
    }
  }, 300_000);

  /**
   * FINDING (2026-08-17, spec 053 T9). A feed entry that correctly escapes literal angle brackets
   * comes out of the pipeline as live markup. feedText.stripHtmlToPlainText removes tags FIRST and
   * decodes entities SECOND, so `&lt;script&gt;alert(1)&lt;/script&gt;` — the standard, correct
   * way for a feed to publish that text for display — passes the tag-stripping step untouched
   * (there are no `<`…`>` runs yet) and is then turned into a real `<script>` element by the
   * entity decoder. The card's title and hook carry it from there into the DB. React's own
   * escaping is what keeps this from being exploitable in today's grid, so the visible symptom is
   * a title reading `<script>alert(1)</script>` instead of the text the publisher meant; the
   * hazard is that hook/title stop being trustworthy as plain text for anything that renders
   * markup later. Fixing it is a real decision (decode-then-strip changes what a title carrying a
   * literal `&lt;` shows), so it is documented rather than patched here.
   */
  it.fails("never lets a feed's escaped markup become live markup on a card", async () => {
    installFakeNetwork(createFakeChannelNetwork());
    const feedUrl = "https://entity-smuggler.example/feed.xml";
    const run = await prepareDiscoveryJourney({
      network: fakeNetwork(),
      feeds: [],
      extraFeedUrls: [feedUrl],
      qualityCheckEnabled: false,
    });
    run.network.route(feedUrl, {
      body: buildRssFeed("smuggler", [
        {
          guid: "smuggled",
          // Exactly what a well-behaved feed writes to display the text "<script>alert(1)</script>".
          title: "&lt;script&gt;alert(1)&lt;/script&gt;",
          summary: "&lt;img src=x onerror=alert(2)&gt; 正文",
          link: "https://entity-smuggler.example/posts/1",
          pubDate: JOURNEY_START.toUTCString(),
        },
      ]),
    });
    await useDiscoveryStore.getState().loadInitial();
    const repos = await getRepos();
    const pool = await repos.discovery.listNewestCards(50);
    expect(pool.length).toBeGreaterThan(0);
    expect(findLiveMarkupCards(pool)).toEqual([]);
  }, 60_000);

  it("ranks an empty pool and an all-unembedded pool without dying", async () => {
    expect(orderCardsForDisplay([], [], JOURNEY_START.toISOString())).toEqual([]);
    resetFeedSession();
    installFakeNetwork(createFakeChannelNetwork());
    const run = await prepareDiscoveryJourney({
      network: fakeNetwork(),
      feeds: [],
      extraFeedUrls: HOSTILE_FEED_URLS,
    });
    plantHostileWorld(run.network, { random: mulberry32(7), feedCount: 4 });
    await useDiscoveryStore.getState().loadInitial();
    const repos = await getRepos();
    const pool = await repos.discovery.listNewestCards(500);
    expect(
      pool.every((card) => card.embedding_json === null || card.embedding_json.length > 0),
    ).toBe(true);
    const events = await repos.discovery.listAllEvents();
    // The all-unembedded case is the ordinary one on a fresh restock; run it explicitly anyway.
    const unembedded = pool.map((card) => ({ ...card, embedding_json: null }));
    expect(() =>
      orderCardsForDisplay(unembedded, events, JOURNEY_START.toISOString(), {
        explorationShare: Number.NaN,
      }),
    ).not.toThrow();
  }, 120_000);
});
