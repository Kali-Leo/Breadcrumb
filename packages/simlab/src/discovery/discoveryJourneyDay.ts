/**
 * Purpose: one simulated day on the discovery feed — the clock moves, the world publishes, the
 * app restocks, the grid loads page after page, and a persona leaves exactly the silent signals a
 * real reader would. Everything ranked, paged, landed and recorded here is the app's own code
 * (apps/desktop/src/lib/discovery*, stores/discoveryStore); this file only supplies the hands.
 * Side effects: writes the harness database through the app, moves the fake system clock.
 * Main exports: DayRecord, DayOptions, runJourneyDay.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { vi } from "vitest";
import { FEED_PAGE_SIZE } from "../../../../apps/desktop/src/lib/discoveryFeedPaging";
import { useDiscoveryStore } from "../../../../apps/desktop/src/stores/discoveryStore";
import { getRepos } from "./desktopDatabase";
import { drainBackgroundWork, JOURNEY_START, resetFeedSession } from "./discoveryJourneySetup";
import { cardsReadToday, type DiscoveryPersona, reactToCard } from "./discoveryPersona";
import type { FakeChannelNetwork } from "./fakeChannelNetwork";
import type { SyntheticWorld } from "./syntheticChannelWorld";

export interface DayRecord {
  dayIndex: number;
  /** Cards the grid actually put in front of the reader, in order. */
  shown: DiscoveryCardRow[];
  /** Where each page ended, so per-page quotas can be checked. */
  pageBoundaries: number[];
  opened: string[];
  saved: string[];
  disliked: string[];
  unseenPoolCountAfter: number;
  poolSizeAfter: number;
  blockedReason: string | null;
  requestCount: number;
}

export interface DayOptions {
  persona: DiscoveryPersona;
  world: SyntheticWorld;
  network: FakeChannelNetwork;
  dayIndex: number;
  /** How many pages the reader scrolls through. */
  pages?: number;
  /** Runs after the world has published the day and before the app looks at it — used to break a
   * channel for the day. */
  afterPublish?: () => void;
  /** Runs between the last page and the reader's reactions — used to move the dial mid-journey. */
  beforeReacting?: () => Promise<void>;
}

function dayStart(dayIndex: number): Date {
  return new Date(JOURNEY_START.getTime() + dayIndex * 24 * 60 * 60 * 1000);
}

/**
 * One day. The clock is moved first, so every card row, every event row and every freshness
 * decay inside the app sees the simulated day rather than the wall clock.
 */
export async function runJourneyDay(options: DayOptions): Promise<DayRecord> {
  const { persona, world, network, dayIndex } = options;
  const start = dayStart(dayIndex);
  vi.setSystemTime(start);
  world.publishDay(dayIndex, start.toISOString());
  options.afterPublish?.();
  network.clearRequests();
  resetFeedSession();

  /** A tile records its impression as it scrolls into view, so everything above the reader's
   * current position is impressed and the tail of the grid — loaded but not yet reached — is
   * not. `upTo` is where the reader has got to. */
  let impressed = 0;
  const impressUpTo = async (upTo: number): Promise<void> => {
    const onScreen = useDiscoveryStore.getState().cards;
    for (const card of onScreen.slice(impressed, upTo)) {
      await useDiscoveryStore.getState().recordImpression(card.id, card.topic_label);
    }
    impressed = Math.max(impressed, Math.min(upTo, onScreen.length));
  };

  const store = useDiscoveryStore.getState();
  await store.refillPool();
  await useDiscoveryStore.getState().loadInitial();
  // loadInitial hands a restock to the background; a reader scrolls slower than that finishes,
  // and letting it land here is what makes a day replayable.
  await drainBackgroundWork();

  const pageBoundaries = [useDiscoveryStore.getState().cards.length];
  for (let page = 1; page < (options.pages ?? 2); page += 1) {
    const before = useDiscoveryStore.getState().cards.length;
    // Reaching the load-more sentinel means having scrolled past everything above it.
    await impressUpTo(before);
    await useDiscoveryStore.getState().loadMore();
    await drainBackgroundWork();
    const after = useDiscoveryStore.getState().cards.length;
    pageBoundaries.push(after);
    // A reader stops when the feed stops producing; scrolling further would be scrolling
    // against a wall, and the app has already forced a restock behind that wall.
    if (after === before) break;
  }

  // A reader skims a long way but only acts near the top: two pages' worth of decisions is a
  // generous day.
  const loaded = useDiscoveryStore.getState().cards.length;
  const attentionSpan = cardsReadToday(persona, Math.min(loaded, FEED_PAGE_SIZE * 2), dayIndex);
  await impressUpTo(Math.max(impressed, attentionSpan));
  await options.beforeReacting?.();
  const shown = [...useDiscoveryStore.getState().cards];

  const opened: string[] = [];
  const saved: string[] = [];
  const disliked: string[] = [];
  for (const [index, card] of shown.entries()) {
    const actions = useDiscoveryStore.getState();
    if (index >= attentionSpan) continue;
    const reaction = reactToCard(persona, card.topic_label, [String(dayIndex), card.id]);
    if (reaction.dislike) {
      await actions.dislikeCard(card.id, card.topic_label);
      disliked.push(card.id);
      continue;
    }
    if (!reaction.open) continue;
    await actions.openCard(card);
    opened.push(card.id);
    await actions.recordDwell(card.id, card.topic_label, reaction.dwellMilliseconds);
    if (reaction.finish) await actions.recordFinish(card.id, card.topic_label);
    if (reaction.save) {
      await actions.saveCard(card.id, card.topic_label);
      saved.push(card.id);
    }
  }

  const repos = await getRepos();
  return {
    dayIndex,
    shown,
    pageBoundaries,
    opened,
    saved,
    disliked,
    unseenPoolCountAfter: await repos.discovery.countUnseenPoolCards(),
    poolSizeAfter: (await repos.discovery.listCardIds()).length,
    blockedReason: useDiscoveryStore.getState().blockedReason,
    requestCount: network.requests.length,
  };
}
