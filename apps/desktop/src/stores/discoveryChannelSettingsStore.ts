/**
 * Purpose: zustand store for the discovery feed's source settings (spec 053 §8) — which catalog
 * channels are switched on, 省流量模式, the RSS addresses the reader pasted in themselves, the
 * 豆瓣 id that fills the catalog's template entry, and whether the first-run panel has been
 * answered or skipped. Kept out of settingsStore because the background restock reads these
 * before any screen has been opened, so it needs a load it can await (ensureLoaded).
 * Side effects: reads and writes one settings-table row.
 * Main exports: useDiscoveryChannelSettingsStore, ensureDiscoveryChannelSettingsLoaded,
 * DiscoveryChannelSettings, AddUserFeedOutcome.
 */

import { z } from "zod";
import { create } from "zustand";
import { getRepos } from "../lib/db";
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
