/**
 * Purpose: zustand store behind the discovery page. Everything on that page is now computed
 * from this app's own database (lib/platform/browsingPanels) instead of fetched from a separate
 * program on a loopback port, so both editions have the page and neither makes a request.
 *
 * The store also owns the two delivery channels while the page is open: it drains what the
 * local listener took in (desktop) and listens for the page hand-off (browser), then refreshes.
 * And it runs the background re-classification pass, which is why `refresh` is called again
 * after it: an upgraded row changes what the panels say.
 * Main exports: useBrowsingInterestStore, WORD_CLOUD_WINDOWS.
 */
import type {
  BrowsingProfile,
  EmotionCategory,
  EmotionSeries,
  NewInterests,
  ProContent,
  WordCloud,
} from "@breadcrumb/feature-browsing-interest";
import { create } from "zustand";
import {
  connectionCode,
  drainCollectorSpool,
  listenForPageDeliveries,
  type PairingInfo,
  readPairingInfo,
} from "../lib/platform/browsingChannels";
import { readDiscoveryData, WORD_CLOUD_WINDOWS } from "../lib/platform/browsingPanels";
import { upgradeBrowsingClassifications } from "../lib/platform/browsingUpgrade";
import { degradeSilently } from "../lib/platform/failureLog";

export { WORD_CLOUD_WINDOWS };

const nowSeconds = (): number => Date.now() / 1000;

interface BrowsingInterestState {
  /** False until the first read of the database answers — the page shows nothing rather than
   * flashing the setup card at someone who already has months of history. */
  ready: boolean;
  /** Events on record. Zero is the honest "nothing has arrived yet" state. */
  eventCount: number;
  profile: BrowsingProfile | null;
  emotion: EmotionSeries | null;
  emotionCategory: EmotionCategory;
  wordCloud: WordCloud | null;
  wordCloudDays: number;
  newInterests: NewInterests | null;
  proContent: ProContent | null;
  /** Where a browser connects and the one-time code it connects with. Null in the browser
   * edition, which has no listener and needs no code. */
  pairing: PairingInfo | null;
  refresh(): Promise<void>;
  collect(): Promise<void>;
  loadPairing(mint: boolean): Promise<void>;
  setEmotionCategory(category: EmotionCategory): Promise<void>;
  setWordCloudDays(days: number): Promise<void>;
}

export const useBrowsingInterestStore = create<BrowsingInterestState>((set, get) => ({
  ready: false,
  eventCount: 0,
  profile: null,
  emotion: null,
  emotionCategory: "all",
  wordCloud: null,
  wordCloudDays: 30,
  newInterests: null,
  proContent: null,
  pairing: null,

  /** One read of the database, four panels out of it. `ready` is set whatever happens: a
   * database that cannot be read is still an answered question, and the page has an empty
   * state for it. */
  async refresh() {
    try {
      const data = await readDiscoveryData({
        emotionCategory: get().emotionCategory,
        wordCloudDays: get().wordCloudDays,
        now: nowSeconds(),
      });
      set({
        ready: true,
        eventCount: data.eventCount,
        profile: data.profile,
        emotion: data.emotion,
        wordCloud: data.wordCloud,
        newInterests: data.newInterests,
        proContent: data.proContent,
      });
    } catch (error) {
      void degradeSilently("browsing-panels", error);
      set({ ready: true });
    }
  },

  /** Takes in whatever the local listener has been given, then re-classifies a batch of older
   * rows with the embedding model if it happens to be available. Both are best-effort and
   * both refresh the page only when they actually changed something. */
  async collect() {
    const stored = await drainCollectorSpool();
    if (stored > 0) await get().refresh();
    const upgraded = await upgradeBrowsingClassifications();
    if (upgraded > 0) await get().refresh();
  },

  async loadPairing(mint) {
    set({ pairing: await readPairingInfo(mint) });
  },

  async setEmotionCategory(category) {
    set({ emotionCategory: category });
    await get().refresh();
  },

  async setWordCloudDays(days) {
    set({ wordCloudDays: days });
    await get().refresh();
  },
}));

/** The connection code the setup card displays, or null when there is nothing to connect to
 * (the browser edition) or the current code has already been used. */
export function useConnectionCode(): string | null {
  const pairing = useBrowsingInterestStore((state) => state.pairing);
  if (pairing === null || pairing.pairingCode === "") return null;
  return connectionCode(pairing);
}

/** Opens the browser-edition delivery channel for as long as the discovery page is mounted.
 * Returns the closer, so the caller can hand it straight to an effect's cleanup. */
export function openPageChannel(): () => void {
  return listenForPageDeliveries(() => {
    void useBrowsingInterestStore.getState().refresh();
  });
}
