/**
 * Purpose: the one-time startup read of the settings table — split out of settingsStore.ts
 * purely to keep that file under the file-size ceiling. Reads every persisted key in one
 * round, resolves the interface language (and switches the running app to it), and hands the
 * store a ready-to-set snapshot; it never touches the store itself, so this module has no
 * runtime dependency back on the store file.
 * Main exports: loadSettingsSnapshot, SettingsSnapshot.
 */
import { DEFAULT_LANGUAGE_CODE, isLanguageCode, UI_LANGUAGE_CODES } from "@breadcrumb/core-i18n";
import { changeLanguage, rememberLanguage } from "../i18n";
import {
  sanitizeRecommendationWeights,
  type UserRecommendationWeights,
} from "../lib/planner/recommendationWeights";
import { getRepos } from "../lib/platform/db";
import {
  ANSWER_LANGUAGE_KEY,
  API_CONFIG_KEY,
  type ApiConfig,
  CHECKLIST_DISMISSED_KEY,
  COMPARE_CATEGORY_KEY,
  type CompareCategory,
  DEFAULT_ROUTE_PARAMS,
  DEFAULT_SWITCHES,
  FEATURE_SWITCHES_KEY,
  type FeatureSwitches,
  guessLanguage,
  guessMainlandNetwork,
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
import type { SettingsState } from "./settingsStore";

/** Everything loadFromDatabase() writes into the store in one set() — the store's data
 * fields, none of its actions. */
export type SettingsSnapshot = Pick<
  SettingsState,
  | "loaded"
  | "apiConfig"
  | "networkEnabled"
  | "onboardingSeen"
  | "checklistDismissed"
  | "featureSwitches"
  | "mainlandNetwork"
  | "learningMode"
  | "routeParams"
  | "compareCategory"
  | "language"
  | "languageUnchosen"
  | "answerLanguage"
  | "recommendationWeights"
>;

export async function loadSettingsSnapshot(): Promise<SettingsSnapshot> {
  const repos = await getRepos();
  const [
    apiConfig,
    networkEnabled,
    onboardingSeen,
    checklistDismissed,
    featureSwitches,
    mainlandNetwork,
    learningMode,
    routeParams,
    compareCategory,
    storedLanguage,
    storedAnswerLanguage,
    storedRecommendationWeights,
  ] = await Promise.all([
    repos.settings.get<ApiConfig>(API_CONFIG_KEY),
    repos.settings.get<boolean>(NETWORK_ENABLED_KEY),
    repos.settings.get<boolean>(ONBOARDING_SEEN_KEY),
    repos.settings.get<boolean>(CHECKLIST_DISMISSED_KEY),
    repos.settings.get<FeatureSwitches>(FEATURE_SWITCHES_KEY),
    repos.settings.get<boolean>(MAINLAND_NETWORK_KEY),
    repos.settings.get<LearningMode>(LEARNING_MODE_KEY),
    repos.settings.get<RouteParams>(ROUTE_PARAMS_KEY),
    repos.settings.get<CompareCategory>(COMPARE_CATEGORY_KEY),
    repos.settings.get<string>(LANGUAGE_KEY),
    repos.settings.get<string>(ANSWER_LANGUAGE_KEY),
    repos.settings.get<Partial<UserRecommendationWeights>>(RECOMMENDATION_WEIGHTS_KEY),
  ]);
  // An interface language that was removed (or was never ours) must not leave the app
  // showing raw message keys — fall back to the machine's own language, and if that is not
  // one we speak either, open the picker.
  const chosen =
    storedLanguage && UI_LANGUAGE_CODES.includes(storedLanguage) ? storedLanguage : guessLanguage();
  const language = chosen ?? DEFAULT_LANGUAGE_CODE;
  await changeLanguage(language);
  // Only a preference the database really holds is mirrored; a guessed fallback is not.
  if (storedLanguage && UI_LANGUAGE_CODES.includes(storedLanguage))
    rememberLanguage(storedLanguage);
  return {
    loaded: true,
    apiConfig,
    networkEnabled: networkEnabled ?? true,
    onboardingSeen: onboardingSeen ?? false,
    checklistDismissed: checklistDismissed ?? false,
    featureSwitches: { ...DEFAULT_SWITCHES, ...featureSwitches },
    mainlandNetwork: mainlandNetwork ?? guessMainlandNetwork(),
    learningMode: learningMode ?? "casual",
    routeParams: routeParams ?? DEFAULT_ROUTE_PARAMS,
    compareCategory: compareCategory ?? "occupation",
    language,
    languageUnchosen: chosen === null,
    answerLanguage:
      storedAnswerLanguage && isLanguageCode(storedAnswerLanguage) ? storedAnswerLanguage : null,
    recommendationWeights: sanitizeRecommendationWeights(storedRecommendationWeights),
  };
}
