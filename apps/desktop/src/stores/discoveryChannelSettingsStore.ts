/**
 * Purpose: zustand store for the discovery feed's source settings (spec 053 §8, spec 054) — which
 * catalog channels are switched on, 省流量模式, the RSS addresses the reader pasted in themselves,
 * the 豆瓣 id that fills the catalog's template entry, the language the feed speaks and any others
 * the reader added to it, and whether the first-run panel has been answered or skipped. Kept out
 * of settingsStore because the background restock reads these before any screen has been opened,
 * so it needs a load it can await (ensureLoaded). Also the feed's 休闲/专业 mode and the
 * 学术内容 switch (spec 054), which the same filtering pass reads.
 * Side effects: reads and writes one settings-table row.
 * Main exports: useDiscoveryChannelSettingsStore, ensureDiscoveryChannelSettingsLoaded,
 * ensureFeedLanguagePolicyLoaded, ensureFeedModePolicyLoaded, DiscoveryChannelSettings,
 * AddUserFeedOutcome.
 */

import { z } from "zod";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import {
  type FeedMode,
  type FeedModePolicy,
  feedModeSchema,
  resolveFeedModePolicy,
} from "../lib/discoveryFeedMode";
import {
  type FeedLanguage,
  type FeedLanguagePolicy,
  feedLanguageSchema,
  resolveFeedLanguagePolicy,
} from "../lib/discoveryLanguages";
import { nowIso } from "../lib/time";

const SETTINGS_KEY = "discoveryChannelSettings";

/** Stored JSON is outside the type system's reach (an older build, a hand-edited row), so it
 * comes back through Zod like every other external input. */
const discoveryChannelSettingsSchema = z.object({
  /** Only the channels the reader actually switched are in here; everything else follows the
   * catalog entry's own default. */
  channelEnabledById: z.record(z.string(), z.boolean()).default({}),
  dataSaverEnabled: z.boolean().default(false),
  userFeedUrls: z.array(z.url()).default([]),
  doubanUserId: z.string().default(""),
  /** The language the reader picked on the first-run panel. Null until they have been asked, and
   * a null falls back to the app's own default rather than to "show everything". */
  feedLanguage: feedLanguageSchema.nullable().default(null),
  /** The other languages they went on to switch on in the language settings. */
  additionalFeedLanguages: z.array(feedLanguageSchema).default([]),
  /** Which of the feed's two modes is showing (spec 054, Leo's eighth point). */
  feedMode: feedModeSchema.default("casual"),
  /** Whether papers reach the feed at all (Leo's seventh point). On, as the feed has always been. */
  academicContentEnabled: z.boolean().default(true),
  /** True once the first-run panel was answered or skipped — it never comes back on its own. */
  onboardingDismissed: z.boolean().default(false),
});

export type DiscoveryChannelSettings = z.infer<typeof discoveryChannelSettingsSchema>;

const DEFAULT_SETTINGS: DiscoveryChannelSettings = discoveryChannelSettingsSchema.parse({});

export type AddUserFeedOutcome = { ok: true } | { ok: false; reason: string };

const NOT_A_URL_REASON = "这不像一个网址。订阅地址通常以 http 开头。";
const ALREADY_ADDED_REASON = "这个地址已经在列表里了。";

interface DiscoveryChannelSettingsState extends DiscoveryChannelSettings {
  loaded: boolean;
  loadFromDatabase(): Promise<void>;
  setChannelEnabled(sourceId: string, enabled: boolean): Promise<void>;
  setDataSaverEnabled(enabled: boolean): Promise<void>;
  addUserFeedUrl(url: string): Promise<AddUserFeedOutcome>;
  removeUserFeedUrl(url: string): Promise<void>;
  setDoubanUserId(userId: string): Promise<void>;
  setFeedLanguage(language: FeedLanguage): Promise<void>;
  setAdditionalFeedLanguageEnabled(language: FeedLanguage, enabled: boolean): Promise<void>;
  setFeedMode(mode: FeedMode): Promise<void>;
  setAcademicContentEnabled(enabled: boolean): Promise<void>;
  dismissOnboarding(): Promise<void>;
}

export const useDiscoveryChannelSettingsStore = create<DiscoveryChannelSettingsState>(
  (set, get) => {
    const persist = async (patch: Partial<DiscoveryChannelSettings>): Promise<void> => {
      const state = get();
      const next: DiscoveryChannelSettings = {
        channelEnabledById: state.channelEnabledById,
        dataSaverEnabled: state.dataSaverEnabled,
        userFeedUrls: state.userFeedUrls,
        doubanUserId: state.doubanUserId,
        feedLanguage: state.feedLanguage,
        additionalFeedLanguages: state.additionalFeedLanguages,
        feedMode: state.feedMode,
        academicContentEnabled: state.academicContentEnabled,
        onboardingDismissed: state.onboardingDismissed,
        ...patch,
      };
      const repos = await getRepos();
      await repos.settings.set(SETTINGS_KEY, next, nowIso());
      set(next);
    };

    return {
      ...DEFAULT_SETTINGS,
      loaded: false,

      async loadFromDatabase() {
        const repos = await getRepos();
        const stored = await repos.settings.get<unknown>(SETTINGS_KEY);
        const parsed = discoveryChannelSettingsSchema.safeParse(stored ?? {});
        // A row we cannot read means the reader's choices are gone, which is bad enough; losing
        // the feed on top of it would be worse, so the defaults carry on.
        set({ ...(parsed.success ? parsed.data : DEFAULT_SETTINGS), loaded: true });
      },

      async setChannelEnabled(sourceId, enabled) {
        await persist({ channelEnabledById: { ...get().channelEnabledById, [sourceId]: enabled } });
      },

      async setDataSaverEnabled(enabled) {
        await persist({ dataSaverEnabled: enabled });
      },

      async addUserFeedUrl(url) {
        const trimmed = url.trim();
        if (!z.url().safeParse(trimmed).success) return { ok: false, reason: NOT_A_URL_REASON };
        if (get().userFeedUrls.includes(trimmed))
          return { ok: false, reason: ALREADY_ADDED_REASON };
        await persist({ userFeedUrls: [...get().userFeedUrls, trimmed] });
        return { ok: true };
      },

      async removeUserFeedUrl(url) {
        await persist({ userFeedUrls: get().userFeedUrls.filter((entry) => entry !== url) });
      },

      async setDoubanUserId(userId) {
        await persist({ doubanUserId: userId.trim() });
      },

      async setFeedLanguage(language) {
        // The language the reader chose is never also in the additional list: it would come back
        // as a switch they cannot turn off, in the one place those switches are shown.
        await persist({
          feedLanguage: language,
          additionalFeedLanguages: get().additionalFeedLanguages.filter(
            (entry) => entry !== language,
          ),
        });
      },

      async setAdditionalFeedLanguageEnabled(language, enabled) {
        const others = get().additionalFeedLanguages.filter((entry) => entry !== language);
        await persist({ additionalFeedLanguages: enabled ? [...others, language] : others });
      },

      async setFeedMode(mode) {
        await persist({ feedMode: mode });
      },

      async setAcademicContentEnabled(enabled) {
        await persist({ academicContentEnabled: enabled });
      },

      async dismissOnboarding() {
        await persist({ onboardingDismissed: true });
      },
    };
  },
);

/** One shared load: the restock path, the settings page and the feed all await the same round
 * instead of racing three reads of the same row. */
let loadTask: Promise<void> | null = null;

export async function ensureDiscoveryChannelSettingsLoaded(): Promise<DiscoveryChannelSettings> {
  if (!useDiscoveryChannelSettingsStore.getState().loaded) {
    loadTask ??= useDiscoveryChannelSettingsStore
      .getState()
      .loadFromDatabase()
      .finally(() => {
        loadTask = null;
      });
    await loadTask;
  }
  return useDiscoveryChannelSettingsStore.getState();
}

/** The language half of the same settings, in the shape the two filters take. */
export async function ensureFeedLanguagePolicyLoaded(): Promise<FeedLanguagePolicy> {
  return resolveFeedLanguagePolicy(await ensureDiscoveryChannelSettingsLoaded());
}

/** The 休闲/专业 half, in the shape the grid's filter takes. */
export async function ensureFeedModePolicyLoaded(): Promise<FeedModePolicy> {
  return resolveFeedModePolicy(await ensureDiscoveryChannelSettingsLoaded());
}
