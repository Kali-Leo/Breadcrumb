/**
 * Purpose: the shape of everything the settings store persists — the value types, the
 * settings-table keys they are stored under, and the defaults a fresh install starts from.
 * Split out of stores/settingsStore.ts purely to keep that file under the file-size ceiling;
 * it holds no state and imports nothing from the stores, so any module can read the schema
 * without pulling zustand in.
 * Main exports: ApiConfig, PriceOverride, FeatureSwitches, CompareCategory, LearningMode,
 * RouteParams, FeatureHintId, HintsSeen, the SETTINGS_KEYS constants,
 * DEFAULT_ROUTE_PARAMS, DEFAULT_SWITCHES, FEATURE_HINT_IDS, hintsSeenSchema,
 * parseHintsSeen, guessLanguage, guessMainlandNetwork.
 */
import { matchLanguage } from "@breadcrumb/core-i18n";
import type { Currency } from "@breadcrumb/core-llm";
import type { RecommendRouteParams } from "@breadcrumb/feature-planner";
import { z } from "zod";

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Which currency this account is billed in, for models the provider sells in more than
   * one (DeepSeek: CNY on its China platform, USD internationally). Absent for accounts
   * saved before this existed and for single-currency models, where there is nothing to
   * ask — the price table's own currency wins. */
  priceCurrency?: Currency;
  /**
   * Prices the learner typed for their own model, in currency units per million tokens —
   * exactly the way providers publish them. Set when the built-in list has never heard of
   * the model, or has the wrong number for this account. Absent = use the built-in list.
   */
  priceOverride?: PriceOverride;
}

/** Prices as the learner typed them: currency units per million tokens. */
export interface PriceOverride {
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
  /** Optional: providers without a prefix cache have no such rate to enter. */
  cachedInputPerMillionTokens?: number;
}

/** Every optional AI-consuming feature has its own switch (product principle 3). */
export interface FeatureSwitches {
  knowledgeTree: boolean;
  /** Open-web evidence (Zhipu search) for the source material 学习模式 teaches against:
   * per-call cost + a new outbound, so off by default. */
  webSearchEvidence: boolean;
  knowledgeEdges: boolean;
  interest: boolean;
  /** Goal planning: mapping a free-text goal into a knowledge-node set — one LLM call per
   * goal creation. Replaced the retired labPanel switch. */
  goalPlanning: boolean;
  /** Experimental: search-build a comparison profile on demand. */
  compareProfileBuild: boolean;
  /** Semantic alignment between profile items and the user's own vocabulary. */
  compareAlignment: boolean;
  /** Experimental: let the model name the map's clustered continents. */
  mapTopicNaming: boolean;
  /** Teach-back explanation quality judgment → mastery evidence. */
  teachQuality: boolean;
  /** The 🪞 feedback-lab full-page view: candidate forms for "making learning
   * visible", all computed from existing local data. */
  feedbackLab: boolean;
  /** The 🔬 research task platform: runs vetted, project-signed research tasks locally and
   * shows the aggregate results. Default on, no reminder — computation stays on-device and
   * the real consent point is the (not-yet-built) upload step. */
  researchTasks: boolean;
  /** Companion cast: opening/continuing a chat with one of the three companion cards. Off
   * hides the sidebar's 伙伴 section and blocks sending in an open companion conversation. */
  companionChat: boolean;
  /** Companion cast: writes/retrieves the per-companion memory stream (importance scoring +
   * periodic reflection). Off means companions still chat, just without long-term memory. */
  companionMemory: boolean;
  /** Companion cast: generates the teach-back script (expectations/misconceptions/gaps) and
   * runs Reflect-Respond each round. Off falls back to the generic teach prompt. */
  companionScript: boolean;
  /** Focus mode: a picked word's full-screen explain session — each station's streamed
   * answer. Off leaves the rest of focus mode working, with no way to generate a station. */
  focusExplain: boolean;
  /** Term marking: one small call after a reply/focus answer lands, picking which words would
   * trip up this learner — the primary source of explore doors. Off = legacy matching only. */
  termMarking: boolean;
  /** Daily trail summary: on the first launch of a day, one small call turns yesterday's
   * footprints into a single plain sentence for the 「这段时间」 panel. At most one call a
   * day, none on a day nothing was learned. Off shows nothing — no empty card. */
  trailSummary: boolean;
}

/** Which profile family the comparison tree shows: real occupations (真人) or
 * curriculum material (教材). A display filter, not a feature switch. */
export type CompareCategory = "occupation" | "curriculum";

/** 'casual' = wander by curiosity, recommendations grow outward naturally. 'ranked' = push
 * toward a chosen goal (frontier weights the goal's gap; goal surfaces appear). */
export type LearningMode = "ranked" | "casual";

/** The two human-legible sliders behind recommendRoute() — same shape as
 * feature-planner's RecommendRouteParams, re-exported here so components import one name. */
export type RouteParams = RecommendRouteParams;

export const API_CONFIG_KEY = "apiConfig";
/** Whether the saved credentials have ever answered a real request. Set by the settings page's
 * 测试连接 button and cleared whenever the credentials are saved again, so it only ever
 * describes what is in the box now. A boolean — the key is never copied out of API_CONFIG_KEY. */
export const API_CONNECTION_OK_KEY = "apiConnectionOk";
export const NETWORK_ENABLED_KEY = "networkEnabled";
/** Zhipu search key for the open-web evidence layer — its own row, not part of API_CONFIG_KEY. */
export const WEB_SEARCH_KEY_KEY = "webSearchApiKey";
/** Set once the opening slides have been finished or skipped, so they never reappear. */
export const ONBOARDING_SEEN_KEY = "onboardingSeen";
/** Which features have already shown their first-use hint — one object, not one row each. */
export const HINTS_SEEN_KEY = "onboardingHintsSeen";
export const FEATURE_SWITCHES_KEY = "featureSwitches";
export const MAINLAND_NETWORK_KEY = "mainlandNetwork";
export const LEARNING_MODE_KEY = "learningMode";
export const ROUTE_PARAMS_KEY = "routeParams";
export const COMPARE_CATEGORY_KEY = "compareCategory";
export const LANGUAGE_KEY = "language";
export const ANSWER_LANGUAGE_KEY = "answerLanguage";
export const RECOMMENDATION_WEIGHTS_KEY = "recommendationWeights";
/** Neutral starting point: no lean toward steady or fast, no lean toward interest — the
 * learner tunes from the middle. */
export const DEFAULT_ROUTE_PARAMS: RouteParams = { pace: 0.5, interestWeight: 0.5 };
/** Metered features default ON: metering exists so features can run boldly — every switch
 * and its real spend live on the 开关与计价 page, and silent signal collection is a core
 * product value. feedbackLab costs zero tokens and only ever shows plain facts. */
export const DEFAULT_SWITCHES: FeatureSwitches = {
  knowledgeTree: true,
  // Off, the one exception: per-call money AND a new outbound — the learner's call to make.
  webSearchEvidence: false,
  knowledgeEdges: true,
  interest: true,
  goalPlanning: true,
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
  trailSummary: true,
};

/** Every feature that says one sentence about itself the first time it is on screen. The
 * order is the order two hints visible at once are shown in. */
export const FEATURE_HINT_IDS = [
  "chatMode",
  "composer",
  "groundingMark",
  "mapFirstIsland",
  "discoveryScript",
  "libraryImport",
  "settingsApi",
] as const;

export type FeatureHintId = (typeof FEATURE_HINT_IDS)[number];

/** A feature is present here once its hint has been shown; absent means "not yet". Every
 * field is optional so a feature added later starts unseen for everyone, with no migration. */
export const hintsSeenSchema = z.object(
  Object.fromEntries(FEATURE_HINT_IDS.map((id) => [id, z.boolean().optional()])) as Record<
    FeatureHintId,
    z.ZodOptional<z.ZodBoolean>
  >,
);

export type HintsSeen = z.infer<typeof hintsSeenSchema>;

/** A stored row that cannot be read means nobody can prove a hint was shown, and showing a
 * one-line bubble again is the harmless direction to fail in. */
export function parseHintsSeen(stored: unknown): HintsSeen {
  const parsed = hintsSeenSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : {};
}

/** First run: the language the machine is set to, if we have an interface in it. Null when
 * we do not — the app then asks rather than opening in a language nobody chose. */
export function guessLanguage(): string | null {
  const preferred = typeof navigator === "undefined" ? [] : [...(navigator.languages ?? [])];
  return matchLanguage(preferred.length > 0 ? preferred : [navigator?.language ?? ""]);
}

/** Best-effort default: mainland users need mainland-reachable evidence sources. */
export function guessMainlandNetwork(): boolean {
  return navigator.language.toLowerCase() === "zh-cn";
}
