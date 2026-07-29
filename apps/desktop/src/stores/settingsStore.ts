/**
 * Purpose: zustand store for user settings (API config, network switch), persisted
 * in the settings table. Load once at startup; every change writes through.
 * Main exports: useSettingsStore, ApiConfig.
 */
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { nowIso } from "../lib/time";

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const API_CONFIG_KEY = "apiConfig";
const NETWORK_ENABLED_KEY = "networkEnabled";

interface SettingsState {
  loaded: boolean;
  apiConfig: ApiConfig | null;
  networkEnabled: boolean;
  loadFromDatabase(): Promise<void>;
  saveApiConfig(config: ApiConfig): Promise<void>;
  setNetworkEnabled(enabled: boolean): Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  loaded: false,
  apiConfig: null,
  networkEnabled: true,

  async loadFromDatabase() {
    const repos = await getRepos();
    const [apiConfig, networkEnabled] = await Promise.all([
      repos.settings.get<ApiConfig>(API_CONFIG_KEY),
      repos.settings.get<boolean>(NETWORK_ENABLED_KEY),
    ]);
    set({ loaded: true, apiConfig, networkEnabled: networkEnabled ?? true });
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
}));
