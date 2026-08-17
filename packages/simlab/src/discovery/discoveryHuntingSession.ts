/**
 * Purpose: one seeded-random session against the real discovery store — any of the app's actions,
 * in any order, at any moment, including the ones a UI would never fire in that order (a dwell on
 * a card that was just dismissed, a reshape with nothing loaded, a day rollover mid-scroll). The
 * point is that none of it throws and none of it corrupts the grid.
 * Side effects: everything the store does — DB writes, restocks through the fake network.
 * Main exports: runRandomFeedSession, SessionReport.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { vi } from "vitest";
import { useDiscoveryStore } from "../../../../apps/desktop/src/stores/discoveryStore";
import { useSettingsStore } from "../../../../apps/desktop/src/stores/settingsStore";
import { pickWeighted, randomInt } from "../util/prng";
import { JOURNEY_START, resetFeedSession } from "./discoveryJourneyHarness";
import type { FakeChannelNetwork } from "./fakeChannelNetwork";

type Action =
  | "load"
  | "more"
  | "refill"
  | "reshape"
  | "impress"
  | "open"
  | "dwell"
  | "finish"
  | "save"
  | "unsave"
  | "dislike"
  | "dial"
  | "connection"
  | "new-day";

const ACTION_WEIGHTS: readonly { item: Action; weight: number }[] = [
  { item: "load", weight: 3 },
  { item: "more", weight: 4 },
  { item: "refill", weight: 2 },
  { item: "reshape", weight: 2 },
  { item: "impress", weight: 4 },
  { item: "open", weight: 4 },
  { item: "dwell", weight: 3 },
  { item: "finish", weight: 2 },
  { item: "save", weight: 2 },
  { item: "unsave", weight: 1 },
  { item: "dislike", weight: 2 },
  { item: "dial", weight: 1 },
  { item: "connection", weight: 1 },
  { item: "new-day", weight: 1 },
];

/** Durations a dwell timer has actually produced, plus the ones it never should. */
const DWELL_VALUES: readonly number[] = [
  0,
  -1,
  1,
  250,
  45_000,
  7_200_000,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  1.5,
];

export interface SessionReport {
  /** One entry per grid snapshot taken during the session. */
  displayed: DiscoveryCardRow[][];
  actionsRun: Action[];
}

export interface SessionOptions {
  random: () => number;
  network: FakeChannelNetwork;
  planted: readonly string[];
  actionCount?: number;
}

function anyCard(
  random: () => number,
  cards: readonly DiscoveryCardRow[],
): DiscoveryCardRow | null {
  if (cards.length === 0) return null;
  return cards[randomInt(random, 0, cards.length - 1)] ?? null;
}

export async function runRandomFeedSession(options: SessionOptions): Promise<SessionReport> {
  const { random, network } = options;
  const displayed: DiscoveryCardRow[][] = [];
  const actionsRun: Action[] = [];
  let dayIndex = 0;

  const count = options.actionCount ?? randomInt(random, 12, 26);
  for (let step = 0; step < count; step += 1) {
    const action = pickWeighted(random, ACTION_WEIGHTS);
    actionsRun.push(action);
    const store = useDiscoveryStore.getState();
    const card = anyCard(random, store.cards);

    switch (action) {
      case "load":
        await store.loadInitial();
        break;
      case "more":
        await store.loadMore();
        break;
      case "refill":
        await store.refillPool();
        break;
      case "reshape":
        await store.reshapeUpcoming();
        break;
      case "impress":
        if (card) await store.recordImpression(card.id, card.topic_label);
        break;
      case "open":
        if (card) await store.openCard(card);
        break;
      case "dwell":
        if (card) {
          const value = DWELL_VALUES[randomInt(random, 0, DWELL_VALUES.length - 1)] ?? 0;
          await store.recordDwell(card.id, card.topic_label, value);
        }
        break;
      case "finish":
        if (card) await store.recordFinish(card.id, card.topic_label);
        break;
      case "save":
        if (card) await store.saveCard(card.id, card.topic_label);
        break;
      case "unsave":
        if (card) await store.unsaveCard(card.id, card.topic_label);
        break;
      case "dislike":
        if (card) await store.dislikeCard(card.id, card.topic_label);
        break;
      case "dial":
        await useSettingsStore
          .getState()
          .setDiscoveryExplorationShare(
            [-1, 0, 0.15, 0.4, 2, Number.NaN][randomInt(random, 0, 5)] ?? 0.25,
          );
        break;
      case "connection":
        if (random() < 0.5) network.disconnect();
        else network.reconnect();
        await useSettingsStore.getState().setNetworkEnabled(random() < 0.8);
        break;
      case "new-day":
        dayIndex += 1;
        vi.setSystemTime(new Date(JOURNEY_START.getTime() + dayIndex * 86_400_000));
        resetFeedSession();
        break;
    }
    displayed.push([...useDiscoveryStore.getState().cards]);
  }
  return { displayed, actionsRun };
}
