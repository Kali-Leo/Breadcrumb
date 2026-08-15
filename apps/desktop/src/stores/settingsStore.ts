/**
 * Purpose: zustand store for user settings (API config, network switch, per-feature
 * switches, learning mode, route params), persisted in the settings table. Load once at
 * startup; changes write through.
 * Main exports: useSettingsStore, ApiConfig, FeatureSwitches, LearningMode, RouteParams.
 */
import type { RecommendRouteParams } from "@breadcrumb/plugin-planner";
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
  /** Experimental: search-build a comparison profile on demand (spec 023 §5). */
  compareProfileBuild: boolean;
  /** Semantic alignment between profile items and the user's own vocabulary (spec 024). */
  compareAlignment: boolean;
  /** Experimental: let the model name the map's clustered continents (spec 031 §3). */
  mapTopicNaming: boolean;
  /** Teach-back explanation quality judgment → mastery evidence (vision/09 #2). */
  teachQuality: boolean;
  /** The 🪞 feedback-lab full-page view (spec 035): candidate forms for "making learning
   * visible", all computed from existing local data. */
  feedbackLab: boolean;
  /** The 🔬 research task platform (spec 036): runs vetted, project-signed research tasks
   * locally and shows the aggregate results. Default on, no reminder (Leo 2026-08-13) —
   * computation stays on-device and the real consent point is the (not-yet-built) upload
   * step; turning it off shows a one-time plain explanation, then never asks again. */
  researchTasks: boolean;
  /** Companion cast (spec 037): opening/continuing a chat with one of the three companion
   * cards. Off hides the sidebar's 伙伴 section entirely and blocks sending in an open
   * companion conversation. */
  companionChat: boolean;
  /** Companion cast: writes/retrieves the per-companion memory stream (importance scoring +
   * periodic reflection). Off means companions still chat, just without long-term memory. */
  companionMemory: boolean;
  /** Companion cast: generates the teach-back script (expectations/misconceptions/gaps) and
   * runs Reflect-Respond each round. Off falls back to spec-034's generic teach prompt. */
  companionScript: boolean;
  /** Focus mode (spec 042): a picked word's full-screen explain session — each station's
   * streamed answer. Off leaves the rest of focus mode (entry, subway map, exit record)
   * working, just with no way to generate a new station's content. */
  focusExplain: boolean;
  /** Term marking (spec 043): one small call after a reply/focus answer lands, picking which
   * words would trip up this learner — the primary source of explore doors. Off leaves doors
   * to the zero-LLM legacy node-matching source only. */
  termMarking: boolean;
}

/** Which profile family the comparison tree shows (spec 026): real occupations (真人) or
 * curriculum material (教材). A display filter, not a feature switch. */
export type CompareCategory = "occupation" | "curriculum";

/** 'casual' = wander by curiosity, the map grows outward on its own (adjacent-concept
 * proposals). 'ranked' = push toward a chosen goal (frontier weights the goal's gap; the
 * lab's goal section appears). Spec 016 — a mindset switch, not a feature switch. */
export type LearningMode = "ranked" | "casual";

/** The two human-legible sliders behind recommendRoute() (spec 017 #1) — same shape as
 * plugin-planner's RecommendRouteParams, re-exported here so components import one name. */
export type RouteParams = RecommendRouteParams;

const API_CONFIG_KEY = "apiConfig";
const NETWORK_ENABLED_KEY = "networkEnabled";
const FEATURE_SWITCHES_KEY = "featureSwitches";
const MAINLAND_NETWORK_KEY = "mainlandNetwork";
const LEARNING_MODE_KEY = "learningMode";
const ROUTE_PARAMS_KEY = "routeParams";
const COMPARE_CATEGORY_KEY = "compareCategory";
/** Neutral starting point: no lean toward steady or fast, no lean toward interest — the
 * learner tunes from the middle (spec 017 #1). */
const DEFAULT_ROUTE_PARAMS: RouteParams = { pace: 0.5, interestWeight: 0.5 };
/** Metered features default ON: metering exists so features can run boldly — every
 * switch and its real spend live on the 开关与计价 page, and silent signal collection is
 * a core product value (Leo 2026-08-13). Only labPanel stays off: it exposes debug-grade
 * numbers, which is a UI choice, not a spending one. feedbackLab defaults ON too: it costs
 * zero tokens and, unlike labPanel's debug numbers, only ever shows plain facts — exactly
 * the "make learning visible" prototype the product is for (spec 035). */
const DEFAULT_SWITCHES: FeatureSwitches = {
  knowledgeTree: true,
  trail: true,
  factcheck: true,
  knowledgeEdges: true,
  interest: true,
  labPanel: false,
  compareProfileBuild: true,
  compareAlignment: true,
  mapTopicNaming: true,
  teachQuality: true,
  feedbackLab: true,
  researchTasks: true,
  companionChat: true,
  companionMemory: true,
  companionScript: true,
  focusExplain: true,
  termMarking: true,
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
  /** recommendRoute()'s pace/interestWeight sliders (spec 017 #1), 0.5/0.5 by default. */
  routeParams: RouteParams;
  /** 教材/真人 display filter for the comparison tree — occupation (真人) by default. */
  compareCategory: CompareCategory;
  loadFromDatabase(): Promise<void>;
  saveApiConfig(config: ApiConfig): Promise<void>;
  setNetworkEnabled(enabled: boolean): Promise<void>;
  setFeatureSwitch(feature: keyof FeatureSwitches, enabled: boolean): Promise<void>;
  setMainlandNetwork(enabled: boolean): Promise<void>;
  setLearningMode(mode: LearningMode): Promise<void>;
  setRouteParams(params: RouteParams): Promise<void>;
  setCompareCategory(category: CompareCategory): Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  loaded: false,
  apiConfig: null,
  networkEnabled: true,
  featureSwitches: DEFAULT_SWITCHES,
  mainlandNetwork: guessMainlandNetwork(),
  learningMode: "casual",
  routeParams: DEFAULT_ROUTE_PARAMS,
  compareCategory: "occupation",

  async loadFromDatabase() {
    const repos = await getRepos();
    const [
      apiConfig,
      networkEnabled,
      featureSwitches,
      mainlandNetwork,
      learningMode,
      routeParams,
      compareCategory,
    ] = await Promise.all([
      repos.settings.get<ApiConfig>(API_CONFIG_KEY),
      repos.settings.get<boolean>(NETWORK_ENABLED_KEY),
      repos.settings.get<FeatureSwitches>(FEATURE_SWITCHES_KEY),
      repos.settings.get<boolean>(MAINLAND_NETWORK_KEY),
      repos.settings.get<LearningMode>(LEARNING_MODE_KEY),
      repos.settings.get<RouteParams>(ROUTE_PARAMS_KEY),
      repos.settings.get<CompareCategory>(COMPARE_CATEGORY_KEY),
    ]);
    set({
      loaded: true,
      apiConfig,
      networkEnabled: networkEnabled ?? true,
      featureSwitches: { ...DEFAULT_SWITCHES, ...featureSwitches },
      mainlandNetwork: mainlandNetwork ?? guessMainlandNetwork(),
      learningMode: learningMode ?? "casual",
      routeParams: routeParams ?? DEFAULT_ROUTE_PARAMS,
      compareCategory: compareCategory ?? "occupation",
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

  async setRouteParams(params) {
    const repos = await getRepos();
    await repos.settings.set(ROUTE_PARAMS_KEY, params, nowIso());
    set({ routeParams: params });
  },

  async setCompareCategory(category) {
    const repos = await getRepos();
    await repos.settings.set(COMPARE_CATEGORY_KEY, category, nowIso());
    set({ compareCategory: category });
  },
}));
