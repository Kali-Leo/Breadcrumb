/**
 * Purpose: zustand store for user settings (API config, network switch, per-feature
 * switches), persisted in the settings table. Load once at startup; changes write through.
 * Main exports: useSettingsStore, ApiConfig, FeatureSwitches.
 */
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { nowIso } from "../lib/time";

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Every optional AI-consuming feature has its own switch (product principle 3). */
export interface FeatureSwitches {
  knowledgeTree: boolean;
  trail: boolean;
}

const API_CONFIG_KEY = "apiConfig";
const NETWORK_ENABLED_KEY = "networkEnabled";
const FEATURE_SWITCHES_KEY = "featureSwitches";
const DEFAULT_SWITCHES: FeatureSwitches = { knowledgeTree: true, trail: true };

interface SettingsState {
  loaded: boolean;
  apiConfig: ApiConfig | null;
  networkEnabled: boolean;
  featureSwitches: FeatureSwitches;
  loadFromDatabase(): Promise<void>;
  saveApiConfig(config: ApiConfig): Promise<void>;
  setNetworkEnabled(enabled: boolean): Promise<void>;
  setFeatureSwitch(feature: keyof FeatureSwitches, enabled: boolean): Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  loaded: false,
  apiConfig: null,
  networkEnabled: true,
  featureSwitches: DEFAULT_SWITCHES,

  async loadFromDatabase() {
    const repos = await getRepos();
    const [apiConfig, networkEnabled, featureSwitches] = await Promise.all([
      repos.settings.get<ApiConfig>(API_CONFIG_KEY),
      repos.settings.get<boolean>(NETWORK_ENABLED_KEY),
      repos.settings.get<FeatureSwitches>(FEATURE_SWITCHES_KEY),
    ]);
    set({
      loaded: true,
      apiConfig,
      networkEnabled: networkEnabled ?? true,
      featureSwitches: { ...DEFAULT_SWITCHES, ...featureSwitches },
    });
  },

  async saveApiConfig(config) {
    const repos = await getRepos();
    await repos.settings.set(API_CONFIG_KEY, config, nowIso());
    set({ apiConfig: config });
  },

  async setNetworkEnabled(enabled) {
    const repos = await getRepos();
    await repos.settings.set(NETWORK_ENABLED_KEY, enabled, nowIso());
    set({ networkEnabled: enabled });
  },

  async setFeatureSwitch(feature, enabled) {
    const featureSwitches = { ...get().featureSwitches, [feature]: enabled };
    const repos = await getRepos();
    await repos.settings.set(FEATURE_SWITCHES_KEY, featureSwitches, nowIso());
    set({ featureSwitches });
  },
}));
