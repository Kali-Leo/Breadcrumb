/**
 * Purpose: zustand store for user settings (API config, network switch, per-feature
 * switches, route params, interface and answer language), persisted in the settings table. Load once at startup;
 * changes write through. The value types, storage keys and defaults live in
 * lib/platform/settingsSchema.ts, the startup read in settingsStoreLoad.ts and the
 * write-through actions in settingsStoreWrites.ts; this file holds the state itself.
 * (Learning mode was removed by spec 045 and restored by spec 048 — Leo's original design
 * stands, so LearningMode is live.)
 * Main exports: useSettingsStore, SettingsState, ApiConfig, FeatureSwitches, RouteParams,
 * LearningMode.
 */
import { DEFAULT_LANGUAGE_CODE } from "@breadcrumb/core-i18n";
import { create } from "zustand";
import {
  USER_WEIGHT_DEFAULTS,
  type UserRecommendationWeights,
} from "../lib/planner/recommendationWeights";
import {
  type ApiConfig,
  type CompareCategory,
  DEFAULT_ROUTE_PARAMS,
  DEFAULT_SWITCHES,
  type FeatureSwitches,
  guessMainlandNetwork,
  type LearningMode,
  type RouteParams,
} from "../lib/platform/settingsSchema";
import { loadSettingsSnapshot } from "./settingsStoreLoad";
import { createSettingsWriteActions, type SettingsWriteActions } from "./settingsStoreWrites";

export type {
  ApiConfig,
  CompareCategory,
  FeatureSwitches,
  LearningMode,
  PriceOverride,
  RouteParams,
} from "../lib/platform/settingsSchema";

export interface SettingsState extends SettingsWriteActions {
  loaded: boolean;
  apiConfig: ApiConfig | null;
  /** True once the saved credentials have actually answered a request (settings' 测试连接).
   * Saving new credentials clears it: an untested configuration has not been shown to work. */
  apiConnectionOk: boolean;
  networkEnabled: boolean;
  /** False until the newcomer guide has been shown. */
  onboardingSeen: boolean;
  /** True once the first-steps checklist has been dismissed. */
  checklistDismissed: boolean;
  featureSwitches: FeatureSwitches;
  /** True = evidence sources restricted to ones reachable from mainland China. */
  mainlandNetwork: boolean;
  /** casual by default (spec 016) — a new user wanders before they have a goal to rank against. */
  learningMode: LearningMode;
  /** recommendRoute()'s pace/interestWeight sliders (spec 017 #1), 0.5/0.5 by default. */
  routeParams: RouteParams;
  /** 教材/真人 display filter for the comparison tree — occupation (真人) by default. */
  compareCategory: CompareCategory;
  /** Interface language (spec 058) — what the app's own text is written in. */
  language: string;
  /** True when nobody has chosen a language and the machine's own language is not one we
   * have an interface in: the app opens on the language picker instead of guessing. */
  languageUnchosen: boolean;
  /** Answer language, when the user asked the model to write in a different one than the
   * interface. Null means "same as the interface", which is the normal case. */
  answerLanguage: string | null;
  /** The four intent-level recommendation weights, user-tuned via the palace's 推荐偏好
   * panel (spec 060 §3+§5); the browsing weight is derived, not stored. */
  recommendationWeights: UserRecommendationWeights;
  loadFromDatabase(): Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  loaded: false,
  apiConfig: null,
  apiConnectionOk: false,
  networkEnabled: true,
  onboardingSeen: true,
  checklistDismissed: true,
  featureSwitches: DEFAULT_SWITCHES,
  mainlandNetwork: guessMainlandNetwork(),
  learningMode: "casual",
  routeParams: DEFAULT_ROUTE_PARAMS,
  compareCategory: "occupation",
  language: DEFAULT_LANGUAGE_CODE,
  languageUnchosen: false,
  answerLanguage: null,
  recommendationWeights: { ...USER_WEIGHT_DEFAULTS },

  async loadFromDatabase() {
    set(await loadSettingsSnapshot());
  },

  ...createSettingsWriteActions(set, get),
}));
