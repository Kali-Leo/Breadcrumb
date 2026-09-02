/**
 * Purpose: every write-through settings action — persist to the settings table first, then
 * patch the store. Split out of settingsStore.ts purely to keep that file under the
 * file-size ceiling. Takes set/get as parameters (rather than importing useSettingsStore)
 * so this module has no runtime dependency back on the store file.
 * Main exports: createSettingsWriteActions, SettingsWriteActions.
 */
import { isLanguageCode, UI_LANGUAGE_CODES } from "@breadcrumb/core-i18n";
import { changeLanguage } from "../i18n";
import { isPseudoLocale } from "../i18n/pseudoLocale";
import {
  sanitizeRecommendationWeights,
  type UserRecommendationWeights,
} from "../lib/planner/recommendationWeights";
import { forgetAnswerLanguageWatch } from "../lib/platform/answerLanguageWatch";
import { getRepos } from "../lib/platform/db";
import {
  ANSWER_LANGUAGE_KEY,
  API_CONFIG_KEY,
  type ApiConfig,
  CHECKLIST_DISMISSED_KEY,
  COMPARE_CATEGORY_KEY,
  type CompareCategory,
  FEATURE_SWITCHES_KEY,
  type FeatureSwitches,
  LANGUAGE_KEY,
  LEARNING_MODE_KEY,
  type LearningMode,
  MAINLAND_NETWORK_KEY,
  NETWORK_ENABLED_KEY,
  ONBOARDING_SEEN_KEY,
  RECOMMENDATION_WEIGHTS_KEY,
  ROUTE_PARAMS_KEY,
  type RouteParams,
} from "../lib/platform/settingsSchema";
import { nowIso } from "../lib/platform/time";
import type { SettingsState } from "./settingsStore";

export interface SettingsWriteActions {
  saveApiConfig(config: ApiConfig): Promise<void>;
  markOnboardingSeen(): Promise<void>;
  resetOnboarding(): Promise<void>;
  dismissChecklist(): Promise<void>;
  setNetworkEnabled(enabled: boolean): Promise<void>;
  setFeatureSwitch(feature: keyof FeatureSwitches, enabled: boolean): Promise<void>;
  setMainlandNetwork(enabled: boolean): Promise<void>;
  setLearningMode(mode: LearningMode): Promise<void>;
  setRouteParams(params: RouteParams): Promise<void>;
  setCompareCategory(category: CompareCategory): Promise<void>;
  setLanguage(code: string): Promise<void>;
  setAnswerLanguage(code: string | null): Promise<void>;
  setRecommendationWeights(weights: UserRecommendationWeights): Promise<void>;
}

export function createSettingsWriteActions(
  set: (patch: Partial<SettingsState>) => void,
  get: () => SettingsState,
): SettingsWriteActions {
  return {
    async saveApiConfig(config) {
      const repos = await getRepos();
      await repos.settings.set(API_CONFIG_KEY, config, nowIso());
      set({ apiConfig: config });
    },

    /** Puts the newcomer experience back so it runs again on the next load. */
    async resetOnboarding() {
      const repos = await getRepos();
      await repos.settings.set(ONBOARDING_SEEN_KEY, false, nowIso());
      await repos.settings.set(CHECKLIST_DISMISSED_KEY, false, nowIso());
      set({ onboardingSeen: false, checklistDismissed: false });
    },

    async dismissChecklist() {
      const repos = await getRepos();
      await repos.settings.set(CHECKLIST_DISMISSED_KEY, true, nowIso());
      set({ checklistDismissed: true });
    },

    async markOnboardingSeen() {
      const repos = await getRepos();
      await repos.settings.set(ONBOARDING_SEEN_KEY, true, nowIso());
      set({ onboardingSeen: true });
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

    /** Switches the running interface first, then remembers it: a language picker that needs
     * a restart to take effect is a language picker nobody trusts. */
    async setLanguage(code) {
      if (!UI_LANGUAGE_CODES.includes(code) && !isPseudoLocale(code)) return;
      forgetAnswerLanguageWatch();
      await changeLanguage(code);
      const repos = await getRepos();
      await repos.settings.set(LANGUAGE_KEY, code, nowIso());
      set({ language: code, languageUnchosen: false });
    },

    async setRecommendationWeights(weights) {
      const sanitized = sanitizeRecommendationWeights(weights);
      const repos = await getRepos();
      await repos.settings.set(RECOMMENDATION_WEIGHTS_KEY, sanitized, nowIso());
      set({ recommendationWeights: sanitized });
    },

    async setAnswerLanguage(code) {
      // The escalation was about the old language; the new one starts from the plain directive.
      forgetAnswerLanguageWatch();
      const next = code && isLanguageCode(code) ? code : null;
      const repos = await getRepos();
      await repos.settings.set(ANSWER_LANGUAGE_KEY, next, nowIso());
      set({ answerLanguage: next });
    },
  };
}
