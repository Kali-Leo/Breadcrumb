/**
 * Purpose: the shape of everything the settings store persists — the value types, the
 * settings-table keys they are stored under, and the defaults a fresh install starts from.
 * Split out of stores/settingsStore.ts purely to keep that file under the file-size ceiling;
 * it holds no state and imports nothing from the stores, so any module can read the schema
 * without pulling zustand in.
 * Main exports: ApiConfig, PriceOverride, FeatureSwitches, CompareCategory, LearningMode,
 * RouteParams, the SETTINGS_KEYS constants, DEFAULT_ROUTE_PARAMS, DEFAULT_SWITCHES,
 * guessLanguage, guessMainlandNetwork.
 */
import { matchLanguage } from "@breadcrumb/core-i18n";
import type { Currency } from "@breadcrumb/core-llm";
import type { RecommendRouteParams } from "@breadcrumb/feature-planner";

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
  factcheck: boolean;
  knowledgeEdges: boolean;
  interest: boolean;
  /** Goal planning (spec 047): mapping a free-text goal into a knowledge-node set — one
   * LLM call per goal creation. Replaced the retired labPanel switch. */
  goalPlanning: boolean;
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
  /** Daily trail summary: on the first launch of a day, one small call turns yesterday's
   * footprints into a single plain sentence for the 「这段时间」 panel. At most one call a
   * day, none on a day nothing was learned. Off shows nothing — no empty card. */
  trailSummary: boolean;
}

/** Which profile family the comparison tree shows (spec 026): real occupations (真人) or
 * curriculum material (教材). A display filter, not a feature switch. */
export type CompareCategory = "occupation" | "curriculum";

/** 'casual' = wander by curiosity, recommendations grow outward naturally. 'ranked' = push
 * toward a chosen goal (frontier weights the goal's gap; goal surfaces appear). Spec 016,
 * removed by spec 045 and restored by spec 048 (Leo's original design stands). */
export type LearningMode = "ranked" | "casual";

/** The two human-legible sliders behind recommendRoute() (spec 017 #1) — same shape as
 * feature-planner's RecommendRouteParams, re-exported here so components import one name. */
export type RouteParams = RecommendRouteParams;

export const API_CONFIG_KEY = "apiConfig";
/** Whether the saved credentials have ever answered a real request. Set by the settings
 * page's 测试连接 button and cleared whenever the credentials are saved again, so it can
 * only ever describe the configuration that is currently in the box. A boolean and nothing
 * else — the key itself is never copied out of API_CONFIG_KEY. */
export const API_CONNECTION_OK_KEY = "apiConnectionOk";
export const NETWORK_ENABLED_KEY = "networkEnabled";
/** Set once the first-run guide has been finished or skipped, so it never reappears. */
export const ONBOARDING_SEEN_KEY = "onboardingSeen";
/** Separate from ONBOARDING_SEEN_KEY: the checklist is meant to outlive the tour and survive
 * restarts, so "has seen the introduction" and "is done with the checklist" are two answers. */
export const CHECKLIST_DISMISSED_KEY = "onboardingChecklistDismissed";
export const FEATURE_SWITCHES_KEY = "featureSwitches";
export const MAINLAND_NETWORK_KEY = "mainlandNetwork";
export const LEARNING_MODE_KEY = "learningMode";
export const ROUTE_PARAMS_KEY = "routeParams";
export const COMPARE_CATEGORY_KEY = "compareCategory";
export const LANGUAGE_KEY = "language";
export const ANSWER_LANGUAGE_KEY = "answerLanguage";
export const RECOMMENDATION_WEIGHTS_KEY = "recommendationWeights";
/** Neutral starting point: no lean toward steady or fast, no lean toward interest — the
 * learner tunes from the middle (spec 017 #1). */
export const DEFAULT_ROUTE_PARAMS: RouteParams = { pace: 0.5, interestWeight: 0.5 };
/** Metered features default ON: metering exists so features can run boldly — every
 * switch and its real spend live on the 开关与计价 page, and silent signal collection is
 * a core product value (Leo 2026-08-13). feedbackLab costs zero tokens and only ever
 * shows plain facts — exactly the "make learning visible" surface the product is for. */
export const DEFAULT_SWITCHES: FeatureSwitches = {
  knowledgeTree: true,
  factcheck: true,
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

/** First run: the language the machine is set to, if we have an interface in it. Null when
 * we do not — the app then asks rather than opening in a language nobody chose (Leo
 * 2026-09-01). */
export function guessLanguage(): string | null {
  const preferred = typeof navigator === "undefined" ? [] : [...(navigator.languages ?? [])];
  return matchLanguage(preferred.length > 0 ? preferred : [navigator?.language ?? ""]);
}

/** Best-effort default: mainland users need mainland-reachable evidence sources. */
export function guessMainlandNetwork(): boolean {
  return navigator.language.toLowerCase() === "zh-cn";
}
