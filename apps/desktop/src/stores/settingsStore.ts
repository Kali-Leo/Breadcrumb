/**
 * Purpose: zustand store for user settings (API config, network switch, per-feature
 * switches, learning mode), persisted in the settings table. Load once at startup; changes
 * write through.
 * Main exports: useSettingsStore, ApiConfig, FeatureSwitches, LearningMode.
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
  factcheck: boolean;
  knowledgeEdges: boolean;
  interest: boolean;
  labPanel: boolean;
}

/** 'casual' = wander by curiosity, the map grows outward on its own (adjacent-concept
 * proposals). 'ranked' = push toward a chosen goal (frontier weights the goal's gap;
 * unlocks the lab's ladder section). Spec 016 — a mindset switch, not a feature switch. */
export type LearningMode = "ranked" | "casual";

const API_CONFIG_KEY = "apiConfig";
const NETWORK_ENABLED_KEY = "networkEnabled";
const FEATURE_SWITCHES_KEY = "featureSwitches";
const MAINLAND_NETWORK_KEY = "mainlandNetwork";
const LEARNING_MODE_KEY = "learningMode";
/** Fact-check, knowledge-edges, interest and the experimental lab panel default off: they
 * spend tokens (or, for labPanel, expose debug-grade numbers), so the user opts in
 * (spec 009, spec 010, spec 011, spec 012). */
const DEFAULT_SWITCHES: FeatureSwitches = {
  knowledgeTree: true,
  trail: true,
  factcheck: false,
  knowledgeEdges: false,
  interest: false,
  labPanel: false,
};

/** Best-effort default: mainland users need mainland-reachable evidence sources. */
function guessMainlandNetwork(): boolean {
  return navigator.language.toLowerCase() === "zh-cn";
}

interface SettingsState {
  loaded: boolean;
  apiConfig: ApiConfig | null;
  networkEnabled: boolean;
  featureSwitches: FeatureSwitches;
  /** True = evidence sources restricted to ones reachable from mainland China. */
  mainlandNetwork: boolean;
  /** casual by default (spec 016) — a new user wanders before they have a goal to rank against. */
  learningMode: LearningMode;
  loadFromDatabase(): Promise<void>;
  saveApiConfig(config: ApiConfig): Promise<void>;
  setNetworkEnabled(enabled: boolean): Promise<void>;
  setFeatureSwitch(feature: keyof FeatureSwitches, enabled: boolean): Promise<void>;
  setMainlandNetwork(enabled: boolean): Promise<void>;
  setLearningMode(mode: LearningMode): Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  loaded: false,
  apiConfig: null,
  networkEnabled: true,
  featureSwitches: DEFAULT_SWITCHES,
  mainlandNetwork: guessMainlandNetwork(),
  learningMode: "casual",

  async loadFromDatabase() {
    const repos = await getRepos();
    const [apiConfig, networkEnabled, featureSwitches, mainlandNetwork, learningMode] =
      await Promise.all([
        repos.settings.get<ApiConfig>(API_CONFIG_KEY),
        repos.settings.get<boolean>(NETWORK_ENABLED_KEY),
        repos.settings.get<FeatureSwitches>(FEATURE_SWITCHES_KEY),
        repos.settings.get<boolean>(MAINLAND_NETWORK_KEY),
        repos.settings.get<LearningMode>(LEARNING_MODE_KEY),
      ]);
    set({
      loaded: true,
      apiConfig,
      networkEnabled: networkEnabled ?? true,
      featureSwitches: { ...DEFAULT_SWITCHES, ...featureSwitches },
      mainlandNetwork: mainlandNetwork ?? guessMainlandNetwork(),
      learningMode: learningMode ?? "casual",
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

  async setMainlandNetwork(enabled) {
    const repos = await getRepos();
    await repos.settings.set(MAINLAND_NETWORK_KEY, enabled, nowIso());
    set({ mainlandNetwork: enabled });
  },

  async setLearningMode(mode) {
    const repos = await getRepos();
    await repos.settings.set(LEARNING_MODE_KEY, mode, nowIso());
    set({ learningMode: mode });
  },
}));
