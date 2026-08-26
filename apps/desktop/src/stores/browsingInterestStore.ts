/**
 * Purpose: zustand store behind the discovery page — probes the local browsing-interest
 * service, holds what the four panels show, and reads the connection token the setup steps
 * offer for copying. Everything here stays on 127.0.0.1, so it keeps working with the
 * network switch off (nothing leaves the machine).
 * Main exports: useBrowsingInterestStore.
 */
import {
  type BrowsingProfile,
  createBrowsingInterestClient,
  type EmotionCategory,
  type EmotionSeries,
  type NewInterests,
  type ProContent,
  type WordCloud,
} from "@breadcrumb/plugin-browsing-interest";
import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";

/** The service's read endpoints send no CORS headers, so requests must go through Rust. */
const client = createBrowsingInterestClient({
  fetch: (url, init) => tauriFetch(url, init),
});

/** The emotion curves cover a quarter; the word cloud window is the user's choice. */
const EMOTION_DAYS = 90;
const PRO_CONTENT_DAYS = 90;
export const WORD_CLOUD_WINDOWS = [7, 30, 90, 365] as const;

interface BrowsingInterestState {
  connected: boolean;
  /** False until the very first probe answers — the page shows nothing rather than flicker. */
  probed: boolean;
  profile: BrowsingProfile | null;
  emotion: EmotionSeries | null;
  emotionCategory: EmotionCategory;
  wordCloud: WordCloud | null;
  wordCloudDays: number;
  newInterests: NewInterests | null;
  proContent: ProContent | null;
  connectionToken: string | null;
  refresh(): Promise<void>;
  setEmotionCategory(category: EmotionCategory): Promise<void>;
  setWordCloudDays(days: number): Promise<void>;
  loadConnectionToken(): Promise<void>;
}

export const useBrowsingInterestStore = create<BrowsingInterestState>((set, get) => ({
  connected: false,
  probed: false,
  profile: null,
  emotion: null,
  emotionCategory: "all",
  wordCloud: null,
  wordCloudDays: 30,
  newInterests: null,
  proContent: null,
  connectionToken: null,

  /** One round trip per panel; a service that goes away mid-round drops the page back to
   * the setup steps rather than leaving half-stale panels on screen. */
  async refresh() {
    try {
      const profile = await client.profile();
      const [emotion, wordCloud, newInterests, proContent] = await Promise.all([
        client.emotionSeries(EMOTION_DAYS, get().emotionCategory),
        client.wordCloud(get().wordCloudDays),
        client.newInterests(),
        client.proContent(PRO_CONTENT_DAYS),
      ]);
      set({ connected: true, probed: true, profile, emotion, wordCloud, newInterests, proContent });
    } catch {
      set({ connected: false, probed: true });
    }
  },

  async setEmotionCategory(category) {
    set({ emotionCategory: category });
    try {
      set({ emotion: await client.emotionSeries(EMOTION_DAYS, category) });
    } catch {
      set({ connected: false });
    }
  },

  async setWordCloudDays(days) {
    set({ wordCloudDays: days });
    try {
      set({ wordCloud: await client.wordCloud(days) });
    } catch {
      set({ connected: false });
    }
  },

  async loadConnectionToken() {
    try {
      const token = await invoke<string | null>("read_interest_service_token");
      set({ connectionToken: token ?? null });
    } catch {
      set({ connectionToken: null });
    }
  },
}));
