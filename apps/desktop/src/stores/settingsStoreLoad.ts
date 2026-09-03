/**
 * Purpose: the one-time startup read of the settings table — split out of settingsStore.ts
 * purely to keep that file under the file-size ceiling. Reads every persisted key in one
 * round, resolves the interface language (database, then the mirror initI18n reads, then the
 * machine's own language — and switches the running app to it), and hands the store a
 * ready-to-set snapshot; it never touches the store itself, so this module has no
 * runtime dependency back on the store file.
 * Main exports: loadSettingsSnapshot, SettingsSnapshot.
 */
import { DEFAULT_LANGUAGE_CODE, isLanguageCode, UI_LANGUAGE_CODES } from "@breadcrumb/core-i18n";
import { changeLanguage, rememberedLanguage, rememberLanguage } from "../i18n";
import {
  sanitizeRecommendationWeights,
  type UserRecommendationWeights,
} from "../lib/planner/recommendationWeights";
import { getRepos, type Repos } from "../lib/platform/db";
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
import { nowIso } from "../lib/platform/time";
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
  const { language, chosen } = await resolveLanguage(repos, storedLanguage);
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

/** Where the interface language comes from, in order of authority: the database (the choice
 * the learner made), then the mirror beside it (that same choice, in the one place a first
 * frame — or a tab that cannot open the database at all — can read), and only then the
 * machine's own language.
 *
 * The mirror belongs in that chain rather than below the guess. Reading it last would undo,
 * one frame after the first paint, the very switch initI18n had just made from it: someone who
 * chose Chinese got the browser's English for as long as the database took to open, on every
 * reload (2026-09-03 walkthrough). An interface language that was removed (or was never ours)
 * still falls through to the machine's language, and if that is not one we speak either,
 * `chosen` is null and the app opens the picker.
 */
async function resolveLanguage(
  repos: Repos,
  storedLanguage: string | null,
): Promise<{ language: string; chosen: string | null }> {
  const stored =
    storedLanguage !== null && UI_LANGUAGE_CODES.includes(storedLanguage) ? storedLanguage : null;
  const mirrored = stored === null ? rememberedLanguage() : null;
  const chosen = stored ?? mirrored ?? guessLanguage();
  const language = chosen ?? DEFAULT_LANGUAGE_CODE;
  await changeLanguage(language);
  // The two stores of the same choice are brought into line, whichever one had it: a guess is
  // written to neither, because nobody chose it.
  if (stored !== null) rememberLanguage(stored);
  else if (mirrored !== null) await repos.settings.set(LANGUAGE_KEY, mirrored, nowIso());
  return { language, chosen };
}
