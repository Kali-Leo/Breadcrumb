/**
 * Purpose: the one place an LLM call's config is assembled — the saved service credentials,
 * the Tauri fetch, and the directive naming the language the model must answer in (spec 058
 * §1). Every call site builds its config here so no feature can quietly answer in the wrong
 * language.
 * Main exports: llmConfigFrom, currentAnswerLanguage, currentPriceCurrency.
 */
import {
  buildLanguageDirective,
  type Language,
  resolveAnswerLanguage,
} from "@breadcrumb/core-i18n";
import {
  type Currency,
  type LlmClientConfig,
  type ModelRates,
  modelCurrencies,
} from "@breadcrumb/core-llm";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { ApiConfig } from "../stores/settingsStore";
import { useSettingsStore } from "../stores/settingsStore";

/** The language the model is currently asked to write in — the interface language unless
 * the user pointed the answers at another one. */
export function currentAnswerLanguage(): Language {
  const { language, answerLanguage } = useSettingsStore.getState();
  return resolveAnswerLanguage(language, answerLanguage).answerLanguage;
}

/** The currency this account is billed in, for models sold in more than one. Undefined
 * leaves the choice to the price table, which is correct for every single-currency model. */
export function currentPriceCurrency(): Currency | undefined {
  return useSettingsStore.getState().apiConfig?.priceCurrency;
}

/** The learner's own rate card, when they entered one. Needs a currency to be a rate card at
 * all; without a chosen one the account's prices are read as the model's default currency. */
export function currentPriceOverride(): ModelRates | undefined {
  const config = useSettingsStore.getState().apiConfig;
  const override = config?.priceOverride;
  if (override === undefined) return undefined;
  return {
    currency: config?.priceCurrency ?? modelCurrencies(config?.model ?? "")[0] ?? "USD",
    inputPerMillionTokens: override.inputPerMillionTokens,
    outputPerMillionTokens: override.outputPerMillionTokens,
    cachedInputPerMillionTokens: override.cachedInputPerMillionTokens,
  };
}

/** Thrown instead of dialling out while the network switch is off. Every LLM call site
 * already treats a failed request as "degrade quietly", so this lands where those do. */
export class NetworkDisabledError extends Error {
  constructor() {
    super("the network switch is off");
    this.name = "NetworkDisabledError";
  }
}

/**
 * The fetch every LLM request goes through, with the network switch enforced AT the request
 * rather than at each call site.
 *
 * The switch used to be an `if (networkEnabled)` copied to eighteen places, and three of them
 * had been missed — focus-mode explanations and focus label summaries both streamed the
 * learner's text to the provider with the switch off. Checking here means a call site cannot
 * forget: there is one door, and it is locked.
 */
function gatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!useSettingsStore.getState().networkEnabled) {
    return Promise.reject(new NetworkDisabledError());
  }
  return tauriFetch(input as Parameters<typeof tauriFetch>[0], init);
}

/**
 * `firm` is the second attempt after a reply came back in the wrong language: same request,
 * a harder instruction.
 */
export function llmConfigFrom(apiConfig: ApiConfig, options?: { firm?: boolean }): LlmClientConfig {
  // Named rather than spread: priceCurrency is billing bookkeeping and has no business
  // travelling to the provider with the request.
  return {
    baseUrl: apiConfig.baseUrl,
    apiKey: apiConfig.apiKey,
    model: apiConfig.model,
    fetchImpl: gatedFetch,
    answerLanguageDirective: buildLanguageDirective(currentAnswerLanguage(), options),
  };
}
