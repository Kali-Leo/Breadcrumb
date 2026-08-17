/**
 * Purpose: everything a discovery journey needs before its first day — a fresh migrated database,
 * the reader's channel settings written the way the settings page writes them, the module-level
 * stores reset, production's Math.random pinned to a seed, and the drain that lets the store's
 * fire-and-forget restocks finish before anything is torn down or measured.
 * Side effects: opens and replaces the harness database, mutates the desktop stores.
 * Main exports: JOURNEY_START, prepareDiscoveryJourney, resetFeedSession, drainBackgroundWork,
 * pinRandomness.
 */
import { vi } from "vitest";
import { useDiscoveryChannelSettingsStore } from "../../../../apps/desktop/src/stores/discoveryChannelSettingsStore";
import { useDiscoveryStore } from "../../../../apps/desktop/src/stores/discoveryStore";
import { useSettingsStore } from "../../../../apps/desktop/src/stores/settingsStore";
import { mulberry32 } from "../util/prng";
import { openDiscoveryDatabase } from "./desktopDatabase";
import type { FakeChannelNetwork } from "./fakeChannelNetwork";
import {
  createSyntheticWorld,
  JOURNEY_FEEDS,
  type SyntheticWorld,
  type TopicFeed,
} from "./syntheticChannelWorld";

/** Day 0 of every journey — a fixed instant so a failing run is replayable. */
export const JOURNEY_START = new Date("2026-08-17T08:00:00.000Z");

export interface JourneySetupOptions {
  network: FakeChannelNetwork;
  /** Catalog channels are off by default: the reader's own pasted feeds are the topics under
   * test, and leaving the shipped catalog on would mean fetching addresses nobody serves. */
  includeHackerNews?: boolean;
  explorationShare?: number;
  qualityCheckEnabled?: boolean;
  /** Which feeds the reader has subscribed to. Defaults to the ordinary journey set. */
  feeds?: readonly TopicFeed[];
  /** Extra addresses the reader pasted in that have no TopicFeed behind them — the hunting
   * suite's hostile sources. */
  extraFeedUrls?: readonly string[];
}

export interface JourneyRun {
  world: SyntheticWorld;
  network: FakeChannelNetwork;
}

const HACKER_NEWS_SOURCE_ID = "hacker-news-front-page";

/** Every shipped catalog channel, switched off unless the caller asked for it. */
function catalogSwitches(includeHackerNews: boolean): Record<string, boolean> {
  const switches: Record<string, boolean> = {
    sspai: false,
    juejin: false,
    segmentfault: false,
    cnblogs: false,
    "sina-tech": false,
    "linux-do": false,
    "v2ex-hot": false,
    "arxiv-cs-ai": false,
    "arxiv-cs-lg": false,
    "arxiv-q-bio-nc": false,
    "podcast-search": false,
    "douban-interests": false,
  };
  switches[HACKER_NEWS_SOURCE_ID] = includeHackerNews;
  return switches;
}

/**
 * Opens a fresh database, writes the reader's channel settings the way the settings page would,
 * and resets every module-level store so one test file can run several independent journeys.
 */
export async function prepareDiscoveryJourney(options: JourneySetupOptions): Promise<JourneyRun> {
  const feeds = options.feeds ?? JOURNEY_FEEDS;
  // The previous run's restock may still be in the air; letting it finish against its own
  // database is the difference between a clean teardown and a rejection out of nowhere.
  await drainBackgroundWork();
  const { repos } = await openDiscoveryDatabase();
  await repos.settings.set(
    "discoveryChannelSettings",
    {
      channelEnabledById: catalogSwitches(options.includeHackerNews ?? true),
      dataSaverEnabled: false,
      userFeedUrls: [...feeds.map((feed) => feed.feedUrl), ...(options.extraFeedUrls ?? [])],
      doubanUserId: "",
      onboardingDismissed: true,
    },
    JOURNEY_START.toISOString(),
  );
  useDiscoveryChannelSettingsStore.setState({ loaded: false });
  useSettingsStore.setState({
    loaded: true,
    apiConfig:
      options.qualityCheckEnabled === false
        ? null
        : { baseUrl: "https://provider.invalid", apiKey: "k", model: "deepseek-v4-flash" },
    networkEnabled: true,
    discoveryExplorationShare: options.explorationShare ?? 0.25,
  });
  useSettingsStore.setState({
    featureSwitches: {
      ...useSettingsStore.getState().featureSwitches,
      discoveryQualityCheck: options.qualityCheckEnabled !== false,
    },
  });
  resetFeedSession();
  return { world: createSyntheticWorld(options.network, feeds), network: options.network };
}

/**
 * Pins production's own Math.random — plugin-discovery's Thompson sampling draws from it, and a
 * journey that cannot be replayed is not evidence of anything. Returns the restore function.
 */
export function pinRandomness(seed: number): () => void {
  const draw = mulberry32(seed);
  const spy = vi.spyOn(Math, "random").mockImplementation(draw);
  return () => spy.mockRestore();
}

/**
 * Waits for the fire-and-forget work the store starts behind the reader (loadInitial and loadMore
 * both kick off `void runRefill(...).then(stagePending)`). A test that closes its database while
 * one of those is still in the air gets an unhandled rejection from a perfectly healthy app, so
 * every suite drains before tearing down. Real timers: only Date is faked.
 */
export async function drainBackgroundWork(): Promise<void> {
  // A macrotask turn flushes the whole microtask queue, and every step of a restock is a promise
  // over synchronous better-sqlite3 calls — no real I/O to wait on. A few turns is both enough
  // and instant.
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** A fresh app launch: the grid is empty and nothing has been impressed yet. */
export function resetFeedSession(): void {
  useDiscoveryStore.setState({
    cards: [],
    pending: [],
    loading: false,
    blockedReason: null,
    sessionImpressedIds: new Set(),
  });
}
